-- Migration 163: Allow draft job delete when communications_log references it
--
-- SMS intake links communications_log.job_id with default ON DELETE NO ACTION,
-- so DELETE FROM jobs fails with 500 even for empty draft SMS inquiries.
-- Match other job FKs: SET NULL on job (and visit) so history is kept without
-- blocking project cleanup.

ALTER TABLE communications_log
  DROP CONSTRAINT IF EXISTS communications_log_job_id_fkey;

ALTER TABLE communications_log
  ADD CONSTRAINT communications_log_job_id_fkey
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;

ALTER TABLE communications_log
  DROP CONSTRAINT IF EXISTS communications_log_visit_id_fkey;

ALTER TABLE communications_log
  ADD CONSTRAINT communications_log_visit_id_fkey
  FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE SET NULL;

-- Reversal:
--   ALTER TABLE communications_log DROP CONSTRAINT IF EXISTS communications_log_job_id_fkey;
--   ALTER TABLE communications_log ADD CONSTRAINT communications_log_job_id_fkey
--     FOREIGN KEY (job_id) REFERENCES jobs(id);
--   ALTER TABLE communications_log DROP CONSTRAINT IF EXISTS communications_log_visit_id_fkey;
--   ALTER TABLE communications_log ADD CONSTRAINT communications_log_visit_id_fkey
--     FOREIGN KEY (visit_id) REFERENCES visits(id);
