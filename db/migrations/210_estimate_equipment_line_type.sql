-- Migration 210: equipment line type (TASK-192).
-- Rentals and equipment-use charges are their own line type.
-- The previous application never writes 'equipment'. Existing rows stay
-- labor, materials, handling_fee, or adjustment, and those values still pass
-- this CHECK. No backfill. No new column.
-- 209 is person-hours. This file is 210.

ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_line_item_type_check;
ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_line_item_type_check
  CHECK (line_item_type IN ('labor', 'materials', 'handling_fee', 'adjustment', 'equipment'));

ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_line_item_type_check;
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_line_item_type_check
  CHECK (line_item_type IN ('labor', 'materials', 'handling_fee', 'adjustment', 'equipment'));

-- Reversal (data change, run id task-192-equipment-to-materials).
-- List the rows, rewrite each equipment line to materials, then restore the
-- old CHECK. An application rollback does not undo the rewrite.
--
-- SELECT id, 'estimate_line_items' AS source
--   FROM estimate_line_items WHERE line_item_type = 'equipment'
-- UNION ALL
-- SELECT id, 'invoice_line_items'
--   FROM invoice_line_items WHERE line_item_type = 'equipment';
--
-- UPDATE estimate_line_items
--    SET line_item_type = 'materials'
--  WHERE line_item_type = 'equipment';
-- UPDATE invoice_line_items
--    SET line_item_type = 'materials'
--  WHERE line_item_type = 'equipment';
-- ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_line_item_type_check;
-- ALTER TABLE estimate_line_items ADD CONSTRAINT estimate_line_items_line_item_type_check
--   CHECK (line_item_type IN ('labor', 'materials', 'handling_fee', 'adjustment'));
-- ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_line_item_type_check;
-- ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_line_item_type_check
--   CHECK (line_item_type IN ('labor', 'materials', 'handling_fee', 'adjustment'));
