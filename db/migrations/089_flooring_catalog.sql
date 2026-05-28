-- Flooring trade catalog: scope template, service codes 9010–9013, 9099 custom fallback,
-- and category-scoped materials. Separates flooring from the tile-centric
-- specialty_expansion category so the AI selects correct services and generates
-- correct materials (LVP underlayment, feather finish, self-leveling — not thinset/grout).

-- ---------------------------------------------------------------------------
-- Scope template
-- ---------------------------------------------------------------------------

INSERT INTO scope_templates (id, category, label, description) VALUES
  ('01000000-0000-0000-0000-000000000010', 'flooring',
   'Flooring Installation & Prep',
   'LVP, hardwood, laminate installation; concrete skim coat, self-leveling compound, subfloor preparation')
ON CONFLICT (category) DO NOTHING;

-- Scope components
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000010', 'sqft', 'Area (sq ft)', 'sq ft', 'number', NULL, false, 0),
  ('01000000-0000-0000-0000-000000000010', 'floor_type', 'Floor material', NULL, 'select',
    '[{"value":"lvp","label":"LVP / vinyl plank"},{"value":"hardwood","label":"Hardwood / engineered"},{"value":"laminate","label":"Laminate"},{"value":"concrete_prep_only","label":"Concrete prep only"}]',
    false, 1),
  ('01000000-0000-0000-0000-000000000010', 'subfloor_condition', 'Subfloor condition', NULL, 'select',
    '[{"value":"good","label":"Good / flat"},{"value":"minor_leveling","label":"Minor leveling needed"},{"value":"skim_coat","label":"Skim coat required"},{"value":"self_leveler","label":"Self-leveling compound required"}]',
    false, 2),
  ('01000000-0000-0000-0000-000000000010', 'material_cost', 'Known material cost', 'dollars', 'number', NULL, false, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- Complexity factors
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000010', 'complex_layout', 'Complex layout',
    'Posts, bump-outs, diagonal runs, notching or scribing around obstacles',
    'multiplier', 1.25, 0),
  ('01000000-0000-0000-0000-000000000010', 'demo_included', 'Demo / removal included',
    'Existing flooring removal, debris disposal, and subfloor inspection before install',
    'multiplier', 1.20, 1),
  ('01000000-0000-0000-0000-000000000010', 'multi_trip_cure', 'Cure cycle required',
    'Floor prep or self-leveling compound requires 24–48 hour cure before flooring can be installed — minimum 2 visits',
    'multiplier', 1.10, 2),
  ('01000000-0000-0000-0000-000000000010', 'furnished_room', 'Occupied / furnished room',
    'Significant furniture moving or staged re-entry required',
    'multiplier', 1.15, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Price book services
-- ---------------------------------------------------------------------------

INSERT INTO price_book (code, name, category, tier, price_min_cents, price_max_cents, description, notes, default_labor_hours, requires_materials, upsell_codes) VALUES
  ('9010', 'LVP flooring installation', 'flooring', 'specialty', 59500, NULL,
    'Click-lock LVP / vinyl plank installation. Layout, cutting, row spacing, expansion gaps, and transition trim. Substrate must be flat and dry — use 9011/9012 for subfloor prep.',
    'Customer may supply LVP. Quote by sqft.', NULL, true, ARRAY['9011','9012','9013']),
  ('9011', 'Concrete subfloor prep / skim coat', 'flooring', 'specialty', 39500, NULL,
    'Grinding high spots, feather-skim low spots, and primer coat on concrete subfloors. Required before hard-surface flooring on uneven slabs. 24–48 hour cure time before flooring install.',
    '[QUOTE] Degree of unlevelness and whether self-leveler is needed determines scope. Multi-trip required — cure cycle between prep and install.', NULL, true, ARRAY['9010','9012']),
  ('9012', 'Self-leveling compound application', 'flooring', 'specialty', 29500, NULL,
    'Mixed self-leveling compound poured to correct significantly uneven concrete subfloors. Primer required. Minimum 24-hour cure before flooring.',
    '[QUOTE] Coverage depth and area determines bag count.', NULL, true, ARRAY['9011','9010']),
  ('9013', 'Existing flooring removal', 'flooring', 'specialty', 29500, NULL,
    'Removal and debris disposal of carpet, vinyl sheet, laminate, or tile. Includes visual subfloor inspection and condition report.',
    NULL, NULL, false, ARRAY['9010','9011']),
  ('9099', 'Custom / uncatalogued service', 'specialty_expansion', 'specialty', 39500, NULL,
    'For job types not yet in the price book. AI-generated scope description — review required before sending to client.',
    'Add to price book after use if this service type will recur.', NULL, true, ARRAY[]::text[])
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Materials (flooring category, per_coverage on sqft)
-- ---------------------------------------------------------------------------

INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
  ('flooring', 'LVP underlayment / foam pad — 100 sqft roll',
    '1 roll covers 100 sqft. Required under floating LVP on concrete subfloors.',
    'per_coverage', 'sqft', 100, 1.05, 'roll', 2800, 'Flooring', 0),
  ('flooring', 'Feather finish compound — 25lb pail',
    '1 pail covers approx 80 sqft at skim coat thickness. For concrete subfloor prep.',
    'per_coverage', 'sqft', 80, 1.05, 'pail', 1800, 'Flooring', 1),
  ('flooring', 'Concrete bonding primer — 1 qt',
    '1 qt covers approx 150 sqft. Required before skim coat on bare concrete.',
    'per_coverage', 'sqft', 150, 1.0, 'quart', 1400, 'Flooring', 2),
  ('flooring', 'Self-leveling compound — 50lb bag',
    '1 bag covers approx 40 sqft at 1/8" depth. For significantly uneven slabs.',
    'per_coverage', 'sqft', 40, 1.05, 'bag', 3200, 'Flooring', 3)
ON CONFLICT DO NOTHING;
