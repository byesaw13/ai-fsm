-- Migration 070: Service Materials
-- Material rules per price book service/category.
-- quantity_type drives how quantity is computed from scope:
--   'static'       — qty = quantity_flat (always this amount)
--   'per_component'— qty = scope[scope_component_key] * quantity_multiplier
--   'per_coverage' — qty = CEIL(scope[scope_component_key] / quantity_multiplier) * waste_factor
--                    (quantity_multiplier = coverage rate, e.g. 350 sqft/gal)
-- condition_factor_key: only include when this complexity factor is checked (nullable = always include)

CREATE TABLE IF NOT EXISTS service_materials (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id         uuid    REFERENCES price_book(id) ON DELETE CASCADE,
  category              text,   -- matches price_book.category; used when price_book_id is null
  material_name         text    NOT NULL,
  description           text,
  sku                   text,
  quantity_type         text    NOT NULL CHECK (quantity_type IN ('static', 'per_component', 'per_coverage')),
  scope_component_key   text,   -- which scope measurement drives quantity
  quantity_multiplier   numeric(10,4),  -- per_component: multiplier; per_coverage: coverage rate
  quantity_flat         numeric(10,4),  -- static quantity
  waste_factor          numeric(6,4) NOT NULL DEFAULT 1.10,  -- e.g. 1.10 = 10% waste added
  unit                  text    NOT NULL,  -- 'gallon', 'quart', 'roll', 'tube', 'each', 'linear ft', 'box', 'sheet'
  unit_cost_cents       integer NOT NULL DEFAULT 0,
  store_section         text    NOT NULL,  -- used to group shopping list
  is_consumable         boolean NOT NULL DEFAULT true,   -- false = tool (excluded from client cost)
  is_optional           boolean NOT NULL DEFAULT false,  -- true = suggest but don't auto-add
  condition_factor_key  text,   -- complexity factor key that must be checked for this to apply
  sort_order            smallint NOT NULL DEFAULT 0,
  CONSTRAINT service_materials_source_check CHECK (
    price_book_id IS NOT NULL OR category IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_service_materials_pb ON service_materials (price_book_id) WHERE price_book_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_materials_cat ON service_materials (category) WHERE category IS NOT NULL;
