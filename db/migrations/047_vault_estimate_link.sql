-- Migration 047: Link estimates to vault items
-- Additive only — no existing columns or data affected.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS vault_item_id uuid REFERENCES property_vault_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_vault_item
  ON estimates (account_id, vault_item_id)
  WHERE vault_item_id IS NOT NULL;
