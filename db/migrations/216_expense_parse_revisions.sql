-- Migration 216: numbered receipt parse revisions (TASK-211, design §3 "Receipts"
-- and "Receipt reconciliation").
--
-- Every receipt parse or line edit is a numbered revision with a snapshot of its
-- lines, its signed adjustments (returns, receipt-level discounts, coupons), its tax
-- and its reconciliation. expenses.parse_revision is the current revision. Receipt
-- price observations are keyed by revision: the current revision's are active and
-- earlier ones superseded; restoring an earlier revision makes it current again.
-- Concurrent re-parses of one receipt are serialized by a row lock on the expense.
--
-- Compatibility with the previous release: a new table and a new column with a
-- default; the previous code never reads or writes either. Reversal at the bottom.

CREATE TABLE IF NOT EXISTS expense_parse_revisions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expense_id      UUID        NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  revision        INTEGER     NOT NULL CHECK (revision > 0),
  origin          TEXT        NOT NULL CHECK (origin IN ('parse', 'edit', 'restore')),
  line_items      JSONB       NOT NULL,
  adjustments     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tax_cents       INTEGER,
  reconciliation  JSONB       NOT NULL,
  created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_parse_revisions UNIQUE (expense_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_expense_parse_revisions_account
  ON expense_parse_revisions (account_id, expense_id);

ALTER TABLE expense_parse_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_parse_revisions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_parse_revisions' AND policyname = 'expense_parse_revisions_select') THEN
    CREATE POLICY expense_parse_revisions_select ON expense_parse_revisions FOR SELECT
      USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_parse_revisions' AND policyname = 'expense_parse_revisions_insert') THEN
    CREATE POLICY expense_parse_revisions_insert ON expense_parse_revisions FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'expense_parse_revisions' AND policyname = 'expense_parse_revisions_update') THEN
    CREATE POLICY expense_parse_revisions_update ON expense_parse_revisions FOR UPDATE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
END $$;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS parse_revision INTEGER NOT NULL DEFAULT 0;

-- Reversal:
-- ALTER TABLE expenses DROP COLUMN IF EXISTS parse_revision;
-- DROP TABLE IF EXISTS expense_parse_revisions;
