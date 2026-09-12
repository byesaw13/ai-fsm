-- TASK-136: techs cannot UPDATE jobs (RLS owner/admin only). Field Done still
-- needs to complete the project. Tight SECURITY DEFINER: only status → completed
-- for the session account, and only from in_progress.

CREATE OR REPLACE FUNCTION complete_job_from_closeout(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_status text;
BEGIN
  IF current_setting('app.current_account_id', true) IS NULL
     OR current_setting('app.current_account_id', true) = '' THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE jobs
     SET status = 'completed', updated_at = now()
   WHERE id = p_job_id
     AND account_id = current_setting('app.current_account_id')::uuid
     AND status = 'in_progress'
  RETURNING status INTO new_status;

  RETURN new_status;
END;
$$;

REVOKE ALL ON FUNCTION complete_job_from_closeout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_job_from_closeout(uuid) TO PUBLIC;

COMMENT ON FUNCTION complete_job_from_closeout(uuid) IS
  'Visit closeout Done path: mark the project completed without widening jobs UPDATE RLS.';

-- Reversal:
-- DROP FUNCTION IF EXISTS complete_job_from_closeout(uuid);
