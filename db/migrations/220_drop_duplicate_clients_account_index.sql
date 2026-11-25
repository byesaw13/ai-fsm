-- Migration 220: drop a duplicate index (TASK-255).
-- idx_clients_account (001) and idx_clients_account_id (075) are the same
-- btree on clients(account_id). Keep the original.
DROP INDEX IF EXISTS idx_clients_account_id;

-- Reversal: CREATE INDEX IF NOT EXISTS idx_clients_account_id ON clients (account_id);
