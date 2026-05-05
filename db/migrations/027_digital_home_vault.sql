-- Digital Home Vault: per-property record of systems, appliances, materials, and notes.
CREATE TABLE property_vault_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id         UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  category            TEXT        NOT NULL
                                  CHECK (category IN (
                                    'mechanical',
                                    'appliance',
                                    'filter',
                                    'paint_finish',
                                    'monitor',
                                    'vendor',
                                    'other'
                                  )),
  name                TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 255),
  location            TEXT,
  manufacturer        TEXT,
  model_number        TEXT,
  serial_number       TEXT,
  install_date        DATE,
  last_serviced_date  DATE,
  next_service_date   DATE,
  notes               TEXT,
  linked_visit_id     UUID        REFERENCES visits(id) ON DELETE SET NULL,
  created_by          UUID        NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_vault_items_property  ON property_vault_items (account_id, property_id);
CREATE INDEX ix_vault_items_category  ON property_vault_items (account_id, property_id, category);

CREATE TRIGGER trg_vault_items_updated_at
  BEFORE UPDATE ON property_vault_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE property_vault_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_items_account_isolation ON property_vault_items
  USING (account_id = (current_setting('app.current_account_id', true))::uuid);
