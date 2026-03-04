-- ============================================================
-- 009_period_closes.sql
-- Month-end close records for bookkeeping handoff (P8-T6).
--
-- A period_close row signals that the operator has reviewed
-- and exported all data for that calendar month.  The record
-- is advisory — it does NOT block further inserts or mutations
-- on closed months (operator-responsibility pattern, ADR-018).
--
-- period_month format: 'YYYY-MM'  (TEXT, not DATE — ADR-016)
-- ============================================================

CREATE TABLE period_closes (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  period_month  TEXT         NOT NULL
                               CHECK (period_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  closed_by     UUID         NOT NULL REFERENCES users(id),
  closed_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  notes         TEXT,
  UNIQUE (account_id, period_month)
);

CREATE INDEX ix_period_closes_account ON period_closes(account_id);

-- ---- RLS ----
ALTER TABLE period_closes ENABLE ROW LEVEL SECURITY;

CREATE POLICY period_closes_account_isolation ON period_closes
  USING (account_id = current_setting('app.current_account_id', true)::UUID);
