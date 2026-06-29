-- Migration 127: business_days (TASK-051, Operations Engine Phase 1).
--
-- A flexible daily container that SUMMARIZES today's operational records and
-- OWNS NOTHING. Other concerns (payroll, activity, presence, vehicle) reference
-- a business_day via business_day_id, but the day never cascades or closes them.
-- Closing a trip / activity / job, or returning home, never closes the day —
-- only an explicit Day Close does, and Reopen is a normal action.
--
-- Canonical design: docs/canonical/OPERATIONS.md.

CREATE TABLE IF NOT EXISTS business_days (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id          UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_date    DATE         NOT NULL,
  status           TEXT         NOT NULL DEFAULT 'OPEN'
                     CHECK (status IN ('OPEN','ACTIVE','PAUSED','READY_TO_CLOSE','CLOSED','REOPENED')),
  opened_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  reopened_reason  TEXT,
  notes            TEXT,
  created_by       UUID         NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Exactly one day record per person per date. Reopen flips status back; it
  -- never creates a second row for the same date (the day is an aggregate).
  CONSTRAINT business_days_user_date_uniq UNIQUE (account_id, user_id, business_date),
  -- closed_at is present exactly when the day is CLOSED; Reopen nulls it.
  CONSTRAINT business_days_closed_at_chk CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_business_days_account_status ON business_days (account_id, status);

CREATE TRIGGER trg_business_days_updated_at BEFORE UPDATE ON business_days
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE business_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_days FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_days' AND policyname='business_days_select') THEN
    CREATE POLICY business_days_select ON business_days FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_days' AND policyname='business_days_insert') THEN
    CREATE POLICY business_days_insert ON business_days FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_days' AND policyname='business_days_update') THEN
    CREATE POLICY business_days_update ON business_days FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='business_days' AND policyname='business_days_delete') THEN
    CREATE POLICY business_days_delete ON business_days FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;
