-- Migration 022: Change orders for approved estimates
-- Allows adding scope/cost to approved estimates via amendments.

CREATE TABLE IF NOT EXISTS change_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id     UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'sent', 'approved', 'declined')),
  subtotal_cents  INT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents       INT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents     INT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  invoice_id      UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  declined_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_orders_estimate_id_idx ON change_orders(estimate_id);
CREATE INDEX IF NOT EXISTS change_orders_account_id_idx ON change_orders(account_id);
CREATE INDEX IF NOT EXISTS change_orders_status_idx ON change_orders(status);

CREATE TABLE IF NOT EXISTS change_order_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES change_orders(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  quantity        NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit_price_cents INT NOT NULL CHECK (unit_price_cents >= 0),
  total_cents     INT NOT NULL CHECK (total_cents >= 0),
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS change_order_line_items_co_id_idx ON change_order_line_items(change_order_id);

-- Add change_order_id to invoice_line_items so we can trace amendment invoices back
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS change_order_id UUID REFERENCES change_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoice_line_items_change_order_id_idx ON invoice_line_items(change_order_id)
  WHERE change_order_id IS NOT NULL;
