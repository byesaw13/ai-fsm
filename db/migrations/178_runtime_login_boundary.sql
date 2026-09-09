-- TASK-132: the only pre-session users lookup. The caller still verifies bcrypt
-- and rejects ambiguous email addresses. No table-wide users policy is opened.
CREATE OR REPLACE FUNCTION app_login_candidates(login_email text)
RETURNS TABLE (
  id uuid, email text, full_name text, role text, account_id uuid, password_hash text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT u.id, u.email, u.full_name, u.role, u.account_id, u.password_hash
  FROM public.users u
  WHERE lower(u.email) = lower(login_email)
  ORDER BY u.created_at ASC, u.id ASC
  LIMIT 2;
$$;
REVOKE ALL ON FUNCTION app_login_candidates(text) FROM PUBLIC;
-- scripts/db-provision-runtime.sh grants EXECUTE only to the web login role.
-- Rollback: restore the previous application login query, then
-- DROP FUNCTION app_login_candidates(text);
