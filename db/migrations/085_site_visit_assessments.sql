-- Migration 085: Site visit assessment form
-- Adds a structured assessment record for site visits: rooms, measurements, scope notes,
-- site conditions. Also adds 'assessment' as a valid visit_media category.

-- Widen visit_media category to include 'assessment' photos
ALTER TABLE visit_media
  DROP CONSTRAINT IF EXISTS visit_media_category_check;

ALTER TABLE visit_media
  ADD CONSTRAINT visit_media_category_check
    CHECK (category IN ('before', 'after', 'receipt', 'assessment'));

-- Assessment table: one row per site visit
CREATE TABLE IF NOT EXISTS site_visit_assessments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id        UUID         NOT NULL UNIQUE REFERENCES visits(id) ON DELETE CASCADE,
  account_id      UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- rooms: [{id, name, length_ft, width_ft, height_ft, notes}]
  rooms           JSONB        NOT NULL DEFAULT '[]',
  scope_notes     TEXT,
  access_notes    TEXT,
  -- conditions flags
  has_pets        BOOLEAN      NOT NULL DEFAULT false,
  difficult_access BOOLEAN     NOT NULL DEFAULT false,
  asbestos_risk   BOOLEAN      NOT NULL DEFAULT false,
  lead_paint_risk BOOLEAN      NOT NULL DEFAULT false,
  -- computed / entered totals
  total_sqft      NUMERIC(10,2),
  completed_at    TIMESTAMPTZ,
  created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sva_visit   ON site_visit_assessments (visit_id);
CREATE INDEX IF NOT EXISTS idx_sva_account ON site_visit_assessments (account_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_site_visit_assessments_updated'
      AND tgrelid = 'site_visit_assessments'::regclass
  ) THEN
    CREATE TRIGGER trg_site_visit_assessments_updated
      BEFORE UPDATE ON site_visit_assessments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS
ALTER TABLE site_visit_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_visit_assessments FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_visit_assessments' AND policyname = 'sva_select') THEN
    CREATE POLICY sva_select ON site_visit_assessments FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_visit_assessments' AND policyname = 'sva_insert') THEN
    CREATE POLICY sva_insert ON site_visit_assessments FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_visit_assessments' AND policyname = 'sva_update') THEN
    CREATE POLICY sva_update ON site_visit_assessments FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'site_visit_assessments' AND policyname = 'sva_delete') THEN
    CREATE POLICY sva_delete ON site_visit_assessments FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin()
    );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE site_visit_assessments;
-- ALTER TABLE visit_media DROP CONSTRAINT visit_media_category_check;
-- ALTER TABLE visit_media ADD CONSTRAINT visit_media_category_check CHECK (category IN ('before','after','receipt'));
