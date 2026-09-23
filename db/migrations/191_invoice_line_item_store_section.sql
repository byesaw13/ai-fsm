-- Migration 191: store section on invoice material lines (TASK-152 slice 3).
-- Lets the owner organize billed materials by store section (Lumber, Paint,
-- Hardware, …) so the bill lines up with the buy-list plan. Nullable; NULL lines
-- group under "Other". Additive.

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS store_section text;

-- ── Reversal plan ────────────────────────────────────────────────────────────
-- Additive; forward-only runner. To reverse (no data loss beyond the section
-- labels, which are a display grouping, not a source of truth):
--   ALTER TABLE invoice_line_items DROP COLUMN IF EXISTS store_section;
