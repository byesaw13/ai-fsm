-- Per-SKU receipt lines for itemized invoice billing.
CREATE TABLE IF NOT EXISTS expense_line_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expense_id   UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  quantity     NUMERIC(12, 4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_cost_cents INT NOT NULL CHECK (unit_cost_cents > 0),
  sku          TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_line_items_expense
  ON expense_line_items (expense_id);

CREATE INDEX IF NOT EXISTS idx_expense_line_items_account
  ON expense_line_items (account_id);

-- Multiple invoice lines may trace to one expense (one per SKU).
DROP INDEX IF EXISTS invoice_line_items_source_expense_unique;

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS source_expense_line_item_id UUID
    REFERENCES expense_line_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_items_source_expense_line_unique
  ON invoice_line_items (invoice_id, source_expense_line_item_id)
  WHERE source_expense_line_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS invoice_line_items_source_expense_idx
  ON invoice_line_items (invoice_id, source_expense_id)
  WHERE source_expense_id IS NOT NULL;

ALTER TABLE expense_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_line_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_line_items_select ON expense_line_items;
CREATE POLICY expense_line_items_select ON expense_line_items
  FOR SELECT USING (account_id = app_account_id());

DROP POLICY IF EXISTS expense_line_items_insert ON expense_line_items;
CREATE POLICY expense_line_items_insert ON expense_line_items
  FOR INSERT WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());

DROP POLICY IF EXISTS expense_line_items_update ON expense_line_items;
CREATE POLICY expense_line_items_update ON expense_line_items
  FOR UPDATE USING (account_id = app_account_id() AND is_owner_or_admin());

DROP POLICY IF EXISTS expense_line_items_delete ON expense_line_items;
CREATE POLICY expense_line_items_delete ON expense_line_items
  FOR DELETE USING (account_id = app_account_id() AND is_owner_or_admin());