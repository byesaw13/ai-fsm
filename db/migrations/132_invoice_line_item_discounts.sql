-- Migration 132: allow negative 'adjustment' invoice line items so they can be
-- used as discounts (e.g. "Loyalty discount" at -$50). Other line types
-- (labor/materials/handling_fee) stay >= 0. Reversible: re-add the strict checks.
--
-- The invoices subtotal/total checks (>= 0) are unchanged — a discount can't drive
-- the invoice below $0; recalculateInvoiceTotals clamps the rollup at 0.

ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_unit_price_cents_check;
ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_total_cents_check;

ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_unit_price_cents_check
  CHECK (line_item_type = 'adjustment' OR unit_price_cents >= 0);
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_total_cents_check
  CHECK (line_item_type = 'adjustment' OR total_cents >= 0);
