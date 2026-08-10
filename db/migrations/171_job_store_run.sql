ALTER TABLE job_material_lines
  ADD COLUMN IF NOT EXISTS supplier TEXT,
  ADD COLUMN IF NOT EXISTS aisle TEXT,
  ADD COLUMN IF NOT EXISTS bay TEXT;

ALTER TABLE materials_price_book
  ADD COLUMN IF NOT EXISTS aisle TEXT,
  ADD COLUMN IF NOT EXISTS bay TEXT;

CREATE TABLE IF NOT EXISTS account_supplier_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  supplier TEXT NOT NULL CHECK (btrim(supplier) <> ''),
  supplier_normalized TEXT NOT NULL CHECK (supplier_normalized = lower(btrim(supplier))),
  branch_label TEXT NOT NULL CHECK (btrim(branch_label) <> ''),
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, supplier_normalized)
);

CREATE INDEX IF NOT EXISTS idx_job_material_lines_supplier_needed
  ON job_material_lines (account_id, job_id, lower(supplier))
  WHERE status = 'needed';

CREATE INDEX IF NOT EXISTS idx_account_supplier_preferences_account
  ON account_supplier_preferences (account_id);

DROP TRIGGER IF EXISTS trg_account_supplier_preferences_updated
  ON account_supplier_preferences;
CREATE TRIGGER trg_account_supplier_preferences_updated
  BEFORE UPDATE ON account_supplier_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE account_supplier_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_supplier_preferences FORCE ROW LEVEL SECURITY;

CREATE POLICY account_supplier_preferences_select
  ON account_supplier_preferences FOR SELECT
  USING (account_id = app_account_id());

CREATE POLICY account_supplier_preferences_insert
  ON account_supplier_preferences FOR INSERT
  WITH CHECK (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  );

CREATE POLICY account_supplier_preferences_update
  ON account_supplier_preferences FOR UPDATE
  USING (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  )
  WITH CHECK (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  );

CREATE POLICY account_supplier_preferences_delete
  ON account_supplier_preferences FOR DELETE
  USING (
    account_id = app_account_id()
    AND app_role() IN ('owner', 'admin')
  );

-- Reversal:
-- DROP TABLE account_supplier_preferences;
-- DROP INDEX idx_job_material_lines_supplier_needed;
-- ALTER TABLE materials_price_book DROP COLUMN aisle, DROP COLUMN bay;
-- ALTER TABLE job_material_lines DROP COLUMN supplier, DROP COLUMN aisle, DROP COLUMN bay;
