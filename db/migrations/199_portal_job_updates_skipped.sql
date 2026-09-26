-- TASK-163: the owner can skip a finished job in the "customer reports to send"
-- queue. A skipped row is never public (the public lookup only reads
-- 'published'); publishing it later works as normal.
ALTER TABLE portal_job_updates DROP CONSTRAINT portal_job_updates_status_check;
ALTER TABLE portal_job_updates ADD CONSTRAINT portal_job_updates_status_check
  CHECK (status IN ('draft', 'published', 'withdrawn', 'skipped'));
-- Rollback: DELETE FROM portal_job_updates WHERE status = 'skipped'; then
-- restore the check without 'skipped'.
