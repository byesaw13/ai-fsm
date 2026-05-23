-- Migration 072: Add estimate-level scope snapshot support
-- Allows storing scope snapshots keyed to estimate_id + category
-- instead of requiring a specific estimate_line_item_id.
-- estimate_line_item_id is made nullable for backwards compatibility.

ALTER TABLE estimate_scope_snapshots
  ADD COLUMN IF NOT EXISTS estimate_id uuid REFERENCES estimates ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category text,
  ALTER COLUMN estimate_line_item_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ess_estimate ON estimate_scope_snapshots (estimate_id)
  WHERE estimate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ess_line_item ON estimate_scope_snapshots (estimate_line_item_id)
  WHERE estimate_line_item_id IS NOT NULL;
