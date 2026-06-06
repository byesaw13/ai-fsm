-- Migration 107: Explicit Estimate Deposit Policy
-- Separates job pricing from payment/deposit terms. New estimates do not assume a deposit.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS deposit_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_type text NOT NULL DEFAULT 'none'
    CHECK (deposit_type IN ('none', 'materials', 'percentage', 'fixed')),
  ADD COLUMN IF NOT EXISTS deposit_percentage numeric(5,2),
  ADD COLUMN IF NOT EXISTS deposit_fixed_cents integer,
  ADD COLUMN IF NOT EXISTS deposit_due_trigger text NOT NULL DEFAULT 'before_scheduling'
    CHECK (deposit_due_trigger IN ('on_acceptance', 'before_scheduling', 'before_material_order', 'custom')),
  ADD COLUMN IF NOT EXISTS terms_scope_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_payment_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_change_order_accepted boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN estimates.deposit_required IS 'Explicit payment policy flag. False means no deposit is required and deposit_cents must be zero for new writes.';
COMMENT ON COLUMN estimates.deposit_type IS 'Explicit deposit policy: none, materials, percentage, or fixed.';
COMMENT ON COLUMN estimates.deposit_percentage IS 'Percentage used only when deposit_type=percentage. Null means no percentage was selected.';
COMMENT ON COLUMN estimates.deposit_fixed_cents IS 'Fixed deposit amount used only when deposit_type=fixed.';
COMMENT ON COLUMN estimates.deposit_due_trigger IS 'Customer-facing timing for when an explicit deposit is due.';
COMMENT ON COLUMN estimates.terms_scope_accepted IS 'Estimator confirmed scope/exclusions terms should be included.';
COMMENT ON COLUMN estimates.terms_payment_accepted IS 'Estimator confirmed payment terms should be included.';
COMMENT ON COLUMN estimates.terms_change_order_accepted IS 'Estimator confirmed change-order terms should be included.';

-- Historical estimates already have stored deposit_cents from the old policy.
-- Preserve those dollar amounts while marking them as explicit percentage terms
-- so approval/final-invoice reconciliation remains backward compatible.
-- Disable the immutability trigger so terminal-state estimates (declined, expired)
-- can receive the backfill — only the new classification columns change, no financial data.
ALTER TABLE estimates DISABLE TRIGGER trg_estimates_immutability;

UPDATE estimates
   SET deposit_required = true,
       deposit_type = 'percentage',
       deposit_percentage = 30,
       deposit_due_trigger = 'before_scheduling',
       terms_payment_accepted = true
 WHERE deposit_cents > 0
   AND deposit_required = false;

ALTER TABLE estimates ENABLE TRIGGER trg_estimates_immutability;
