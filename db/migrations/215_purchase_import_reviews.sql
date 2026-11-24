-- Migration 215: review records for store purchase imports (TASK-211).
--
-- A CSV trip that may already be in the books (a look-alike receipt, a conflicting
-- transaction ID, or no transaction identity at all) is held as a review record
-- instead of being booked or priced. Records survive reloads and deploys; they are
-- not expenses and add nothing to job cost or price evidence until confirmed.
-- Dismissed records are kept and can be reopened.
-- Design: docs/working/estimating-assistant-phase3.md §3.
--
-- expenses.store_number holds the store a trip was bought at, so a CSV trip and a
-- receipt link automatically only on the full identity (supplier, store, date,
-- transaction ID).
--
-- Compatibility with the previous release: a new table and one new nullable column;
-- the previous code never reads or writes either. Reversal at the bottom.

CREATE TABLE IF NOT EXISTS purchase_import_reviews (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  mode             TEXT        NOT NULL CHECK (mode IN ('history', 'book')),
  identity_key     TEXT        NOT NULL,
  reason           TEXT        NOT NULL CHECK (reason IN (
                     'possible_duplicate', 'conflicting_transaction_id', 'no_transaction_identity'
                   )),
  payload          JSONB       NOT NULL,
  value_cents      INTEGER     NOT NULL,
  match_expense_id UUID        REFERENCES expenses(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'resolved_same', 'resolved_different', 'dismissed')),
  dismiss_reason   TEXT,
  expense_id       UUID        REFERENCES expenses(id) ON DELETE SET NULL,
  created_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  resolved_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_import_reviews_identity UNIQUE (account_id, mode, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_purchase_import_reviews_pending
  ON purchase_import_reviews (account_id, created_at DESC) WHERE status = 'pending';

ALTER TABLE purchase_import_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_import_reviews FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_import_reviews' AND policyname = 'purchase_import_reviews_select') THEN
    CREATE POLICY purchase_import_reviews_select ON purchase_import_reviews FOR SELECT
      USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_import_reviews' AND policyname = 'purchase_import_reviews_insert') THEN
    CREATE POLICY purchase_import_reviews_insert ON purchase_import_reviews FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'purchase_import_reviews' AND policyname = 'purchase_import_reviews_update') THEN
    CREATE POLICY purchase_import_reviews_update ON purchase_import_reviews FOR UPDATE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
END $$;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS store_number TEXT;

-- Reversal:
-- ALTER TABLE expenses DROP COLUMN IF EXISTS store_number;
-- DROP TABLE IF EXISTS purchase_import_reviews;
