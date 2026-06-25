-- Migration 129: time_clock_sessions (TASK-052, Operations Engine Phase 2).
--
-- The payroll clock answers one question: "was this person working?" — wholly
-- independent of WHAT they were doing (that is the activity timeline). Switching
-- activities never touches the clock. All pay types derive from this one clock;
-- only the downstream calculation differs (Payroll Policies). Corrections void +
-- re-add, never delete. Canonical: docs/canonical/OPERATIONS.md.

CREATE TABLE IF NOT EXISTS time_clock_sessions (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- RESTRICT, not CASCADE: payroll time is financial history. Removing a team
  -- member must not silently erase their clock records — deactivate the user
  -- instead. (Account deletion still cascades the whole account.)
  user_id                UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- The Business Day is an aggregate that owns nothing: a clock references its day
  -- but is never cascaded by it.
  business_day_id        UUID         REFERENCES business_days(id) ON DELETE SET NULL,
  clock_in_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  clock_out_at           TIMESTAMPTZ,
  status                 TEXT         NOT NULL DEFAULT 'open'
                           CHECK (status IN ('open','closed')),
  pay_type               TEXT         NOT NULL DEFAULT 'hourly'
                           CHECK (pay_type IN ('hourly','salary','piecework','subcontractor','owner_draw')),
  hourly_rate_snapshot_cents INT      CHECK (hourly_rate_snapshot_cents IS NULL OR hourly_rate_snapshot_cents >= 0),
  break_policy           TEXT,
  notes                  TEXT,
  voided_at              TIMESTAMPTZ,
  correction_reason      TEXT,
  created_by             UUID         NOT NULL REFERENCES users(id),
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- clock_out_at is present exactly when the session is closed.
  CONSTRAINT time_clock_closed_chk CHECK ((status = 'closed') = (clock_out_at IS NOT NULL)),
  -- A closed session must end after it began.
  CONSTRAINT time_clock_order_chk  CHECK (clock_out_at IS NULL OR clock_out_at > clock_in_at)
);

-- At most one open (non-voided) clock per person at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_one_open
  ON time_clock_sessions (account_id, user_id)
  WHERE status = 'open' AND voided_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_time_clock_user_in ON time_clock_sessions (account_id, user_id, clock_in_at);
CREATE INDEX IF NOT EXISTS idx_time_clock_business_day ON time_clock_sessions (business_day_id);

CREATE TRIGGER trg_time_clock_sessions_updated_at BEFORE UPDATE ON time_clock_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE time_clock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_clock_sessions FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_clock_sessions' AND policyname='time_clock_select') THEN
    CREATE POLICY time_clock_select ON time_clock_sessions FOR SELECT USING (account_id = app_account_id());
  END IF;
  -- A person clocks their own time; owner/admin may manage any in the account.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_clock_sessions' AND policyname='time_clock_insert') THEN
    CREATE POLICY time_clock_insert ON time_clock_sessions FOR INSERT WITH CHECK (
      account_id = app_account_id()
      AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_clock_sessions' AND policyname='time_clock_update') THEN
    CREATE POLICY time_clock_update ON time_clock_sessions FOR UPDATE USING (
      account_id = app_account_id()
      AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='time_clock_sessions' AND policyname='time_clock_delete') THEN
    CREATE POLICY time_clock_delete ON time_clock_sessions FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;
