-- Migration 111: activity_entries — the owner's time ledger.
--
-- One table records where time goes (job work, travel, estimating, admin, …).
-- Rules enforced here:
--   * at most ONE active entry (ended_at IS NULL) per account — partial unique
--   * entries are facts: corrections are void + re-add (voided_at), not edits
--   * the "timesheet" is derived from these rows; it is never entered by hand
-- Entity links (job/visit/estimate/invoice/client/expense) power profitability
-- rollups; category math never depends on the link.

CREATE TABLE IF NOT EXISTS activity_entries (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id       UUID         REFERENCES users(id) ON DELETE SET NULL,
  session_date  DATE         NOT NULL DEFAULT CURRENT_DATE,
  activity_type TEXT         NOT NULL CHECK (activity_type IN (
                  'job_work','travel','material_run',
                  'estimate_visit','estimate_writing','follow_up',
                  'invoicing','admin','customer_comms',
                  'fsm_development','training','marketing',
                  'personal'
                )),
  category      TEXT         NOT NULL CHECK (category IN ('revenue','sales','office','growth','personal')),
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  entity_type   TEXT         CHECK (entity_type IN ('job','visit','estimate','invoice','client','expense')),
  entity_id     UUID,
  source        TEXT         NOT NULL DEFAULT 'manual' CHECK (source IN (
                  'manual','auto_visit','auto_material_run','auto_estimate','backfill'
                )),
  note          TEXT,
  voided_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at),
  CHECK ((entity_type IS NULL) = (entity_id IS NULL))
);

-- One active activity per account (voided rows don't count).
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_one_active
  ON activity_entries (account_id)
  WHERE ended_at IS NULL AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activity_account_date
  ON activity_entries (account_id, session_date);
CREATE INDEX IF NOT EXISTS idx_activity_entity
  ON activity_entries (entity_type, entity_id) WHERE entity_id IS NOT NULL;

-- RLS (same posture as vehicle_sessions)
ALTER TABLE activity_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_entries FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_entries' AND policyname = 'activity_entries_select') THEN
    CREATE POLICY activity_entries_select ON activity_entries FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_entries' AND policyname = 'activity_entries_insert') THEN
    CREATE POLICY activity_entries_insert ON activity_entries FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_entries' AND policyname = 'activity_entries_update') THEN
    CREATE POLICY activity_entries_update ON activity_entries FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'activity_entries' AND policyname = 'activity_entries_delete') THEN
    CREATE POLICY activity_entries_delete ON activity_entries FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin()
    );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS activity_entries;
