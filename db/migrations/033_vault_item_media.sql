-- Migration 033: Behind-wall photo attachments for Digital Home Vault items

CREATE TABLE property_vault_item_media (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vault_item_id UUID        NOT NULL REFERENCES property_vault_items(id) ON DELETE CASCADE,
  filename      TEXT        NOT NULL,
  original_name TEXT        NOT NULL,
  mime_type     TEXT        NOT NULL,
  size_bytes    INTEGER     NOT NULL,
  created_by    UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vault_item_media_item ON property_vault_item_media(vault_item_id);
CREATE INDEX idx_vault_item_media_account ON property_vault_item_media(account_id);

ALTER TABLE property_vault_item_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY vault_item_media_select ON property_vault_item_media
  FOR SELECT USING (account_id = app_account_id());

CREATE POLICY vault_item_media_insert ON property_vault_item_media
  FOR INSERT WITH CHECK (account_id = app_account_id());

CREATE POLICY vault_item_media_delete ON property_vault_item_media
  FOR DELETE USING (account_id = app_account_id());
