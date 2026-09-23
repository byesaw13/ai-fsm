-- Migration 190: classify invoice material lines (TASK-152 slice 2).
-- Materials and equipment/rentals were both line_item_type='materials', so the
-- bill could not group or subtotal them. Add a nullable material_kind on the
-- material lines so the invoice can show "Materials" vs "Equipment & rentals"
-- with per-group subtotals. Only 'material' and 'equipment' are populated today;
-- 'consumable' is allowed for a later capture-time signal. Additive.

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS material_kind text;

ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_material_kind_check;
ALTER TABLE invoice_line_items
  ADD CONSTRAINT invoice_line_items_material_kind_check
  CHECK (material_kind IS NULL OR material_kind IN ('material', 'consumable', 'equipment'));

-- ── Reversal plan ────────────────────────────────────────────────────────────
-- Additive; the runner applies forward files only. To reverse (no data loss —
-- material_kind is a display grouping, not a source of truth; NULL degrades to
-- one flat materials group):
--   ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_item_material_kind_check;
--   ALTER TABLE invoice_line_items DROP COLUMN IF EXISTS material_kind;
