-- TASK-161: a portal client can change their email, but the change only lands
-- after the new address clicks a verify link. Reuses portal_magic_links: a row
-- with pending_email set is an email-change token, never a login token.
ALTER TABLE portal_magic_links ADD COLUMN IF NOT EXISTS pending_email text;
