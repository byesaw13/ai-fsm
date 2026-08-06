-- Migration 168: one open activity per (account, user), not per account.
-- TASK-056 multi-tech: each tech keeps their own open activity without
-- closing a coworker's timer. Matches getCurrentOperationsState user_id scope.

-- Drop account-wide uniqueness (migration 111).
DROP INDEX IF EXISTS idx_activity_one_active;

-- One open, non-voided activity per user within an account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_one_active_per_user
  ON activity_entries (account_id, user_id)
  WHERE ended_at IS NULL AND voided_at IS NULL AND user_id IS NOT NULL;

-- Legacy open rows with NULL user_id: still at most one per account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_one_active_null_user
  ON activity_entries (account_id)
  WHERE ended_at IS NULL AND voided_at IS NULL AND user_id IS NULL;

-- Down (manual):
-- DROP INDEX IF EXISTS idx_activity_one_active_per_user;
-- DROP INDEX IF EXISTS idx_activity_one_active_null_user;
-- CREATE UNIQUE INDEX idx_activity_one_active ON activity_entries (account_id)
--   WHERE ended_at IS NULL AND voided_at IS NULL;
