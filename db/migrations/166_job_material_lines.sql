-- Migration 166: Job-owned materials buy list (TASK-082 B1).
-- Pre-run plan lines (intent). Distinct from work_order_materials (priced WO lines)
-- and expense receipts (actuals).

CREATE TABLE IF NOT EXISTS job_material_lines (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id                UUID         NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name                  TEXT         NOT NULL,
  quantity              NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_label            TEXT,
  store_section         TEXT,
  status                TEXT         NOT NULL DEFAULT 'needed'
                          CHECK (status IN ('needed', 'purchased', 'on_truck', 'not_needed')),
  source                TEXT         NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('estimate', 'kit', 'ai', 'manual')),
  catalog_material_id   UUID,
  sku                   TEXT,
  notes                 TEXT,
  sort_order            INT          NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_material_lines_job
  ON job_material_lines (job_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_job_material_lines_account_job
  ON job_material_lines (account_id, job_id);

CREATE TRIGGER trg_job_material_lines_updated_at
  BEFORE UPDATE ON job_material_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_material_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_material_lines FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_material_lines' AND policyname = 'jml_select'
  ) THEN
    CREATE POLICY jml_select ON job_material_lines FOR SELECT
      USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_material_lines' AND policyname = 'jml_insert'
  ) THEN
    CREATE POLICY jml_insert ON job_material_lines FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_material_lines' AND policyname = 'jml_update'
  ) THEN
    CREATE POLICY jml_update ON job_material_lines FOR UPDATE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'job_material_lines' AND policyname = 'jml_delete'
  ) THEN
    CREATE POLICY jml_delete ON job_material_lines FOR DELETE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
END $$;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS materials_plan_seeded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS materials_plan_seed_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL;

COMMENT ON TABLE job_material_lines IS
  'Job buy list (pre-run materials intent). Not receipts; not work_order_materials.';
COMMENT ON COLUMN jobs.materials_plan_seeded_at IS
  'Set after first successful seed from estimate; blocks auto re-seed without explicit reseed.';

-- Reversal:
-- ALTER TABLE jobs DROP COLUMN IF EXISTS materials_plan_seed_estimate_id;
-- ALTER TABLE jobs DROP COLUMN IF EXISTS materials_plan_seeded_at;
-- DROP TABLE IF EXISTS job_material_lines;
