-- Migration 110: expense import provenance + dedupe
-- Lets store-CSV imports (Home Depot, etc.) record where each expense came from
-- and skip re-importing the same store transaction on overlapping exports.

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS source       TEXT,   -- e.g. 'home_depot_csv'; NULL = manual/receipt
  ADD COLUMN IF NOT EXISTS external_ref TEXT;   -- store transaction id (idempotency key)

-- One expense per (account, source, transaction). Partial so manual expenses
-- (source IS NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_source_ref
  ON expenses (account_id, source, external_ref)
  WHERE source IS NOT NULL AND external_ref IS NOT NULL;

-- Reversal:
-- DROP INDEX IF EXISTS idx_expenses_source_ref;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS external_ref, DROP COLUMN IF EXISTS source;
