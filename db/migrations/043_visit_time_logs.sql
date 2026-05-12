-- ============================================================
-- 043_visit_time_logs.sql
-- Persists field-mode on-site time across visit start/end
-- transitions. Each visit may have at most one active timer.
-- ============================================================

CREATE TABLE IF NOT EXISTS visit_time_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visit_id    uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  job_id      uuid REFERENCES jobs(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at > started_at)
);

CREATE INDEX IF NOT EXISTS visit_time_logs_account_started_idx
  ON visit_time_logs(account_id, started_at DESC);

CREATE INDEX IF NOT EXISTS visit_time_logs_visit_started_idx
  ON visit_time_logs(visit_id, started_at DESC);

CREATE INDEX IF NOT EXISTS visit_time_logs_job_started_idx
  ON visit_time_logs(job_id, started_at DESC)
  WHERE job_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS visit_time_logs_one_active_per_visit_idx
  ON visit_time_logs(visit_id)
  WHERE ended_at IS NULL;

DROP TRIGGER IF EXISTS trg_visit_time_logs_updated_at ON visit_time_logs;
CREATE TRIGGER trg_visit_time_logs_updated_at
  BEFORE UPDATE ON visit_time_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE visit_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visit_time_logs_select ON visit_time_logs;
CREATE POLICY visit_time_logs_select ON visit_time_logs
  FOR SELECT USING (account_id = app_account_id());

DROP POLICY IF EXISTS visit_time_logs_insert ON visit_time_logs;
CREATE POLICY visit_time_logs_insert ON visit_time_logs
  FOR INSERT WITH CHECK (account_id = app_account_id());

DROP POLICY IF EXISTS visit_time_logs_update ON visit_time_logs;
CREATE POLICY visit_time_logs_update ON visit_time_logs
  FOR UPDATE USING (account_id = app_account_id())
  WITH CHECK (account_id = app_account_id());

DROP POLICY IF EXISTS visit_time_logs_delete ON visit_time_logs;
CREATE POLICY visit_time_logs_delete ON visit_time_logs
  FOR DELETE USING (account_id = app_account_id());
