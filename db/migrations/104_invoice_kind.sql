-- 104_invoice_kind.sql
-- Make the deposit-vs-final billing model explicit and impossible to confuse.
--
-- Problem this fixes:
--   - On approval a deposit invoice is auto-created.
--   - The estimate→invoice "Convert" idempotency guard matched ANY invoice for
--     the estimate, so once a deposit invoice existed, Convert returned the
--     deposit invoice and never produced the real final invoice.
--   - The final invoice did not net out the deposit already billed, risking
--     double billing.
--
-- The canonical model is now: exactly one deposit invoice (optional) plus one
-- final invoice per estimate. invoice_kind makes the role of each invoice
-- explicit so queries can target them precisely.
--
-- Additive + idempotent. Safe to re-run.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_kind text NOT NULL DEFAULT 'standard'
    CHECK (invoice_kind IN ('standard', 'deposit', 'final'));

-- Backfill historical rows from the conventions used before this column existed:
--   deposit invoices were tagged via "notes LIKE 'Deposit: %'"
--   any other estimate-linked invoice was the final/converted invoice
--
-- The invoice immutability trigger blocks updates to sent/paid invoices, so the
-- one-time classification backfill is run with that trigger disabled. This only
-- touches the new classification column, never financial fields.
ALTER TABLE invoices DISABLE TRIGGER trg_invoices_immutability;

UPDATE invoices
   SET invoice_kind = 'deposit'
 WHERE invoice_kind = 'standard'
   AND notes LIKE 'Deposit: %';

UPDATE invoices
   SET invoice_kind = 'final'
 WHERE invoice_kind = 'standard'
   AND estimate_id IS NOT NULL
   AND notes NOT LIKE 'Deposit: %';

ALTER TABLE invoices ENABLE TRIGGER trg_invoices_immutability;

-- One final invoice per estimate (deposits are excluded from the constraint).
-- Partial unique index tolerates many standard/deposit invoices but guarantees
-- the convert path can never create two finals for the same estimate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_one_final_per_estimate
  ON invoices (estimate_id)
  WHERE invoice_kind = 'final' AND estimate_id IS NOT NULL;

-- Fast lookup of an estimate's deposit/final invoices.
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_kind
  ON invoices (account_id, estimate_id, invoice_kind)
  WHERE estimate_id IS NOT NULL;
