-- 075_missing_indexes.sql
-- Add missing indexes on high-query tables that were absent from the initial schema.
-- All are IF NOT EXISTS — safe to re-run.

-- clients filtered by account_id on virtually every request
CREATE INDEX IF NOT EXISTS idx_clients_account_id ON clients (account_id);

-- users looked up by account_id for role/session checks
CREATE INDEX IF NOT EXISTS idx_users_account_id ON users (account_id);

-- estimate_line_items joined by estimate_id on every estimate read
CREATE INDEX IF NOT EXISTS idx_estimate_line_items_estimate_id ON estimate_line_items (estimate_id);
