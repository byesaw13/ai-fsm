-- Migration 093: Add shopping_list_json and specified_materials_json to estimates
-- shopping_list_json: computed materials grouped by store section (internal planning)
-- specified_materials_json: products the estimator described in the AI draft description

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS shopping_list_json jsonb,
  ADD COLUMN IF NOT EXISTS specified_materials_json jsonb;

COMMENT ON COLUMN estimates.shopping_list_json IS 'Internal shopping list: computed materials from scope + specified materials from AI draft. Grouped by store section. Not shown to client.';
COMMENT ON COLUMN estimates.specified_materials_json IS 'Products explicitly mentioned in the AI draft description (name, sku, coverage/unit, units to order). Preserved for job planning.';
