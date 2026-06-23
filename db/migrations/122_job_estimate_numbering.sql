-- Migration 122: human-readable job & estimate numbers (TASK-039).
--
-- Adds J-YYYY-#### / EST-YYYY-#### per-account numbers, mirroring the existing
-- invoice_number idea but year-prefixed with a per-year sequence. Numbers are
-- assigned by a BEFORE INSERT trigger so every creation path is covered (jobs
-- are inserted from ~5 call sites), and existing rows are backfilled.

ALTER TABLE jobs      ADD COLUMN IF NOT EXISTS job_number      TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS estimate_number TEXT;

-- Backfill existing rows: per account, per calendar year, in creation order.
UPDATE jobs j SET job_number = n.num
FROM (
  SELECT id,
         'J-' || to_char(created_at, 'YYYY') || '-' ||
         lpad(row_number() OVER (
           PARTITION BY account_id, date_trunc('year', created_at)
           ORDER BY created_at, id
         )::text, 4, '0') AS num
  FROM jobs
) n
WHERE j.id = n.id AND j.job_number IS NULL;

-- Estimates carry an immutability trigger (terminal estimates reject updates);
-- this is a one-time structural backfill of a system number, not a content
-- change, so disable user triggers just for it. (The assign trigger below is
-- INSERT-only and unaffected.)
ALTER TABLE estimates DISABLE TRIGGER USER;
UPDATE estimates e SET estimate_number = n.num
FROM (
  SELECT id,
         'EST-' || to_char(created_at, 'YYYY') || '-' ||
         lpad(row_number() OVER (
           PARTITION BY account_id, date_trunc('year', created_at)
           ORDER BY created_at, id
         )::text, 4, '0') AS num
  FROM estimates
) n
WHERE e.id = n.id AND e.estimate_number IS NULL;
ALTER TABLE estimates ENABLE TRIGGER USER;

-- Auto-assign on insert (any code path) when not supplied. Sequence = count of
-- the account's rows in that year + 1; the unique index is the safety net.
CREATE OR REPLACE FUNCTION assign_job_number() RETURNS trigger AS $$
DECLARE yr TEXT; seq INT;
BEGIN
  IF NEW.job_number IS NULL THEN
    yr := to_char(COALESCE(NEW.created_at, now()), 'YYYY');
    SELECT count(*) + 1 INTO seq FROM jobs
      WHERE account_id = NEW.account_id AND to_char(created_at, 'YYYY') = yr;
    NEW.job_number := 'J-' || yr || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION assign_estimate_number() RETURNS trigger AS $$
DECLARE yr TEXT; seq INT;
BEGIN
  IF NEW.estimate_number IS NULL THEN
    yr := to_char(COALESCE(NEW.created_at, now()), 'YYYY');
    SELECT count(*) + 1 INTO seq FROM estimates
      WHERE account_id = NEW.account_id AND to_char(created_at, 'YYYY') = yr;
    NEW.estimate_number := 'EST-' || yr || '-' || lpad(seq::text, 4, '0');
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_job_number ON jobs;
CREATE TRIGGER trg_assign_job_number BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION assign_job_number();

DROP TRIGGER IF EXISTS trg_assign_estimate_number ON estimates;
CREATE TRIGGER trg_assign_estimate_number BEFORE INSERT ON estimates
  FOR EACH ROW EXECUTE FUNCTION assign_estimate_number();

-- One number per account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_account_number
  ON jobs (account_id, job_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_estimates_account_number
  ON estimates (account_id, estimate_number);

-- Reversal:
-- DROP TRIGGER IF EXISTS trg_assign_job_number ON jobs;
-- DROP TRIGGER IF EXISTS trg_assign_estimate_number ON estimates;
-- DROP FUNCTION IF EXISTS assign_job_number();
-- DROP FUNCTION IF EXISTS assign_estimate_number();
-- DROP INDEX IF EXISTS idx_jobs_account_number;
-- DROP INDEX IF EXISTS idx_estimates_account_number;
-- ALTER TABLE jobs DROP COLUMN IF EXISTS job_number;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS estimate_number;
