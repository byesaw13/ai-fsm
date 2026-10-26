-- Migration 208: what a materials line cost, separate from the customer price
-- (TASK-190). Null means the cost was not entered. The previous application
-- never reads or writes this column, so it keeps working. Convert copies the
-- same number onto the invoice line so the bill keeps the cost.
-- Additive only. No backfill.

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER;

ALTER TABLE estimate_line_items
  DROP CONSTRAINT IF EXISTS estimate_line_items_unit_cost_cents_check;

ALTER TABLE estimate_line_items
  ADD CONSTRAINT estimate_line_items_unit_cost_cents_check
  CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS unit_cost_cents INTEGER;

ALTER TABLE invoice_line_items
  DROP CONSTRAINT IF EXISTS invoice_line_items_unit_cost_cents_check;

ALTER TABLE invoice_line_items
  ADD CONSTRAINT invoice_line_items_unit_cost_cents_check
  CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);

-- Reversal:
-- ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_unit_cost_cents_check;
-- ALTER TABLE invoice_line_items DROP COLUMN IF EXISTS unit_cost_cents;
-- ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_unit_cost_cents_check;
-- ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS unit_cost_cents;
