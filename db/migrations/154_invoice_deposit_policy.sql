-- Migration 154: Deposit policy on invoices (TASK-071).
--
-- Lets a standard invoice request a deposit as a FIRST PAYMENT (fixed $ or %),
-- like Square, without a second invoice. Mirrors the estimate deposit policy
-- (migration 107, minus 'materials').
--
-- Deliberately does NOT use deposit_cents / balance_cents: those are the credit
-- model (balance_cents is generated = total_cents - deposit_cents). Here the
-- deposit is a requested first payment computed live from total_cents; the
-- amount owed stays total_cents and collection is tracked by paid_cents. So the
-- generated column and the estimate deposit/final flow are untouched.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'none'
    CHECK (deposit_type IN ('none', 'percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS deposit_fixed_cents integer;

COMMENT ON COLUMN invoices.deposit_type IS
  'Requested-deposit policy for a standard invoice: none, percentage, or fixed. Computes a first-payment amount; does not reduce total_cents/balance_cents.';
COMMENT ON COLUMN invoices.deposit_percentage IS
  'Percentage of total_cents (incl. tax) when deposit_type = percentage.';
COMMENT ON COLUMN invoices.deposit_fixed_cents IS
  'Fixed deposit amount (cents) when deposit_type = fixed.';

-- Note: enforce_invoice_immutability() (migration 150) is deny-by-omission for
-- sent/partial/overdue invoices — it only raises when a LISTED column changes.
-- These new columns are unlisted, so they are editable until the invoice is paid
-- or void, which is the intended "deposit editable until paid" behavior. No
-- trigger change is required. A future rewrite of that function that adds these
-- columns to the deny-list would silently freeze the deposit — keep them out.

-- Reversal:
-- ALTER TABLE invoices
--   DROP COLUMN IF EXISTS deposit_fixed_cents,
--   DROP COLUMN IF EXISTS deposit_percentage,
--   DROP COLUMN IF EXISTS deposit_type;
