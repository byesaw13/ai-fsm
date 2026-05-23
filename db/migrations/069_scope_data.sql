-- Migration 069: Scope Intelligence — Seed Data
-- Canonical scope templates, components, complexity factors, and profitability rules
-- derived from real Dovetails Services jobs and operational knowledge.

-- ============================================================
-- SCOPE TEMPLATES
-- ============================================================
INSERT INTO scope_templates (id, category, label, description) VALUES
  ('01000000-0000-0000-0000-000000000001', 'painting_finishes',   'Painting & Finishes',        'Interior and exterior painting, staining, and finish work'),
  ('01000000-0000-0000-0000-000000000002', 'carpentry_furniture',  'Carpentry & Furniture',       'Built-ins, shelving, trim, furniture assembly and installation'),
  ('01000000-0000-0000-0000-000000000003', 'general_repairs',      'General Repairs',             'Drywall, doors, windows, caulking, and miscellaneous repairs'),
  ('01000000-0000-0000-0000-000000000004', 'plumbing',             'Plumbing',                    'Fixture replacement, supply line repair, shutoff valves'),
  ('01000000-0000-0000-0000-000000000005', 'electrical',           'Electrical',                  'Outlet and switch replacement, fixture installs, fan wiring'),
  ('01000000-0000-0000-0000-000000000006', 'mounting_installs',    'Mounting & Installs',         'TV mounts, shelving hardware, door hardware, equipment mounting'),
  ('01000000-0000-0000-0000-000000000007', 'outdoor_seasonal',     'Outdoor & Seasonal',          'Deck work, gutter cleaning, exterior caulking, seasonal tasks'),
  ('01000000-0000-0000-0000-000000000008', 'maintenance_small',    'Maintenance & Small Jobs',    'Caulking, weatherstripping, light bulbs, minor adjustments'),
  ('01000000-0000-0000-0000-000000000009', 'specialty_expansion',  'Specialty & Expansion',       'Tile work, LVP flooring, bathroom remodels, project phases')
ON CONFLICT (category) DO NOTHING;

-- ============================================================
-- SCOPE COMPONENTS
-- ============================================================

-- PAINTING & FINISHES
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000001', 'wall_sqft',       'Wall surface area',        'sq ft',       'number', NULL, true,  0),
  ('01000000-0000-0000-0000-000000000001', 'ceiling_sqft',    'Ceiling area',             'sq ft',       'number', NULL, false, 1),
  ('01000000-0000-0000-0000-000000000001', 'trim_linear_ft',  'Trim / baseboard',         'linear ft',   'number', NULL, false, 2),
  ('01000000-0000-0000-0000-000000000001', 'door_count',      'Doors to paint',           'doors',       'number', NULL, false, 3),
  ('01000000-0000-0000-0000-000000000001', 'window_count',    'Window casings',           'windows',     'number', NULL, false, 4),
  ('01000000-0000-0000-0000-000000000001', 'coat_count',      'Number of finish coats',   NULL,          'select',
    '[{"value":"1","label":"1 coat"},{"value":"2","label":"2 coats (standard)"},{"value":"3","label":"3 coats (dark-to-light or stain block)"}]',
    false, 5),
  ('01000000-0000-0000-0000-000000000001', 'paint_finish',    'Paint finish',             NULL,          'select',
    '[{"value":"flat","label":"Flat"},{"value":"eggshell","label":"Eggshell (standard)"},{"value":"satin","label":"Satin"},{"value":"semi_gloss","label":"Semi-gloss (trim/bath)"},{"value":"gloss","label":"Gloss"}]',
    false, 6),
  ('01000000-0000-0000-0000-000000000001', 'material_cost',   'Known material cost',      'dollars',     'number', NULL, false, 7)
ON CONFLICT (template_id, key) DO NOTHING;

-- CARPENTRY & FURNITURE
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000002', 'linear_feet',        'Linear footage',           'linear ft',   'number', NULL, false, 0),
  ('01000000-0000-0000-0000-000000000002', 'piece_count',        'Number of pieces / units', 'pieces',      'number', NULL, false, 1),
  ('01000000-0000-0000-0000-000000000002', 'material_cost',      'Known material cost',      'dollars',     'number', NULL, false, 2),
  ('01000000-0000-0000-0000-000000000002', 'material_source',    'Materials supplied by',    NULL,          'select',
    '[{"value":"dovetails","label":"Dovetails (we source)"},{"value":"client","label":"Client (they source)"}]',
    false, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- GENERAL REPAIRS
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000003', 'repair_count',   'Number of distinct repairs', 'repairs',  'number', NULL, false, 0),
  ('01000000-0000-0000-0000-000000000003', 'repair_type',    'Primary repair type',        NULL,       'select',
    '[{"value":"drywall","label":"Drywall / plaster"},{"value":"door","label":"Door adjustment / hardware"},{"value":"window","label":"Window repair"},{"value":"caulk","label":"Caulking / sealing"},{"value":"misc","label":"Miscellaneous"}]',
    false, 1),
  ('01000000-0000-0000-0000-000000000003', 'drywall_sqft',   'Drywall patch area',         'sq ft',    'number', NULL, false, 2)
ON CONFLICT (template_id, key) DO NOTHING;

-- PLUMBING
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000004', 'fixture_count',  'Number of fixtures',         'fixtures', 'number', NULL, true,  0),
  ('01000000-0000-0000-0000-000000000004', 'access_type',    'Pipe access type',           NULL,       'select',
    '[{"value":"open","label":"Fully accessible"},{"value":"under_sink","label":"Under sink cabinet"},{"value":"crawlspace","label":"Crawlspace / basement"},{"value":"finished_wall","label":"Finished wall (limited access)"}]',
    false, 1)
ON CONFLICT (template_id, key) DO NOTHING;

-- ELECTRICAL
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000005', 'outlet_count',   'Outlets / switches / fixtures', 'items',   'number', NULL, true,  0),
  ('01000000-0000-0000-0000-000000000005', 'panel_work',     'Panel or breaker work',         NULL,      'boolean', NULL, false, 1)
ON CONFLICT (template_id, key) DO NOTHING;

-- MOUNTING & INSTALLS
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000006', 'item_count',     'Items to mount',             'items',    'number', NULL, true,  0),
  ('01000000-0000-0000-0000-000000000006', 'wall_material',  'Wall / substrate material',  NULL,       'select',
    '[{"value":"drywall","label":"Drywall (standard)"},{"value":"tile","label":"Tile"},{"value":"plaster","label":"Plaster"},{"value":"concrete","label":"Concrete / block"},{"value":"brick","label":"Brick"}]',
    false, 1),
  ('01000000-0000-0000-0000-000000000006', 'weight_class',   'Item weight class',          NULL,       'select',
    '[{"value":"light","label":"Light (< 20 lbs)"},{"value":"medium","label":"Medium (20–75 lbs)"},{"value":"heavy","label":"Heavy (> 75 lbs)"}]',
    false, 2)
ON CONFLICT (template_id, key) DO NOTHING;

-- OUTDOOR & SEASONAL
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000007', 'sqft',           'Surface area',               'sq ft',    'number', NULL, false, 0),
  ('01000000-0000-0000-0000-000000000007', 'linear_feet',    'Linear footage',             'linear ft','number', NULL, false, 1),
  ('01000000-0000-0000-0000-000000000007', 'access_type',    'Access required',            NULL,       'select',
    '[{"value":"ground","label":"Ground level"},{"value":"ladder","label":"Ladder (< 20 ft)"},{"value":"extension","label":"Extension ladder (20–30 ft)"},{"value":"scaffold","label":"Scaffold / lift needed"}]',
    false, 2)
ON CONFLICT (template_id, key) DO NOTHING;

-- MAINTENANCE & SMALL JOBS
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000008', 'task_count',     'Number of tasks',            'tasks',    'number', NULL, false, 0),
  ('01000000-0000-0000-0000-000000000008', 'estimated_hours','Estimated hours on-site',    'hours',    'number', NULL, false, 1)
ON CONFLICT (template_id, key) DO NOTHING;

-- SPECIALTY & EXPANSION
INSERT INTO scope_components (template_id, key, label, unit, input_type, options, required, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000009', 'sqft',           'Area (sq ft)',               'sq ft',    'number', NULL, false, 0),
  ('01000000-0000-0000-0000-000000000009', 'phase',          'Project phase',              NULL,       'select',
    '[{"value":"demo","label":"Demo / removal"},{"value":"prep","label":"Prep / substrate"},{"value":"install","label":"Installation"},{"value":"finish","label":"Finishing / trim"},{"value":"full","label":"Full scope (all phases)"}]',
    false, 1),
  ('01000000-0000-0000-0000-000000000009', 'material_cost',  'Known material cost',        'dollars',  'number', NULL, false, 2)
ON CONFLICT (template_id, key) DO NOTHING;

-- ============================================================
-- COMPLEXITY FACTORS
-- ============================================================

-- PAINTING & FINISHES
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000001', 'occupied_home',      'Occupied home',
    'Furniture protection, daily access coordination, careful masking around belongings',
    'multiplier', 1.10, 0),
  ('01000000-0000-0000-0000-000000000001', 'dark_to_light',      'Dark to light color change',
    'Requires primer coat or extra finish coat to achieve proper coverage',
    'multiplier', 1.20, 1),
  ('01000000-0000-0000-0000-000000000001', 'nicotine_staining',  'Nicotine / smoke staining',
    'Seal coat required before finish coats — adds 1–2 full passes',
    'multiplier', 1.30, 2),
  ('01000000-0000-0000-0000-000000000001', 'vaulted_ceilings',   'Vaulted or cathedral ceilings',
    'Ladder repositioning, increased setup time, access complexity',
    'multiplier', 1.15, 3),
  ('01000000-0000-0000-0000-000000000001', 'difficult_masking',  'Intricate trim or complex masking',
    'Built-ins, crown molding, chair rail, or detailed casework requiring careful edge work',
    'multiplier', 1.15, 4),
  ('01000000-0000-0000-0000-000000000001', 'texture_match',      'Texture matching required',
    'Ceiling or wall texture must be matched after patching — spray or hand-applied',
    'multiplier', 1.20, 5),
  ('01000000-0000-0000-0000-000000000001', 'two_person_required','Two-person crew required',
    'Large open areas, stairwells, or vaulted spaces requiring a second set of hands',
    'multiplier', 1.25, 6)
ON CONFLICT (template_id, key) DO NOTHING;

-- CARPENTRY & FURNITURE
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000002', 'site_built',         'Site-built (custom fitted)',
    'Cut and fitted in place — no standard dimensions, requires measuring, scribing, and custom cuts',
    'multiplier', 1.30, 0),
  ('01000000-0000-0000-0000-000000000002', 'finish_premium',     'Premium finish expectation',
    'Client expects paint-grade fills, sanded joints, and clean reveal lines throughout',
    'multiplier', 1.20, 1),
  ('01000000-0000-0000-0000-000000000002', 'wall_anchoring',     'Structural wall anchoring',
    'Must locate studs, use toggle bolts, or add blocking — safety-critical attachment',
    'multiplier', 1.10, 2),
  ('01000000-0000-0000-0000-000000000002', 'material_paint_grade','Paint-grade material',
    'MDF or paint-grade wood requires priming, filling nail holes, and light sanding before final coat',
    'multiplier', 1.15, 3),
  ('01000000-0000-0000-0000-000000000002', 'difficult_access',   'Difficult access / tight space',
    'Closet, alcove, under-stair, or other constrained area limiting tool swing and mobility',
    'multiplier', 1.20, 4)
ON CONFLICT (template_id, key) DO NOTHING;

-- GENERAL REPAIRS
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000003', 'old_house',          'Pre-1960 construction',
    'Non-standard stud spacing, plaster walls, or irregular framing — expect surprises',
    'multiplier', 1.25, 0),
  ('01000000-0000-0000-0000-000000000003', 'texture_match',      'Texture / finish match required',
    'Drywall patch or repair must blend with existing surface — texture spray or hand finish',
    'multiplier', 1.20, 1),
  ('01000000-0000-0000-0000-000000000003', 'difficult_access',   'Difficult access',
    'Work in attic, crawlspace, behind cabinetry, or other constrained location',
    'multiplier', 1.20, 2),
  ('01000000-0000-0000-0000-000000000003', 'water_damage',       'Water damage / mold present',
    'Requires proper containment, removal protocol, and material inspection before repair',
    'multiplier', 1.35, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- PLUMBING
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000004', 'old_pipes',          'Pre-1970 or galvanized pipes',
    'Corroded fittings, non-standard sizes, brittle connections — high risk of breakage during work',
    'multiplier', 1.25, 0),
  ('01000000-0000-0000-0000-000000000004', 'wall_open_required', 'Wall opening required',
    'Must cut drywall to access pipe — includes patching and paint touch-up scope',
    'multiplier', 1.40, 1),
  ('01000000-0000-0000-0000-000000000004', 'shutoff_valve_replace','Shutoff valve replacement',
    'Each shutoff valve replacement adds flat labor and materials',
    'adder', 4500, 2),
  ('01000000-0000-0000-0000-000000000004', 'crawlspace_access',  'Crawlspace access',
    'Work requires entry into crawlspace — PPE, lighting, limited mobility',
    'multiplier', 1.30, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- ELECTRICAL
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000005', 'old_wiring',         'Old wiring (knob-and-tube or aluminum)',
    'Requires careful identification, matching connections, and potential code upgrade — elevated risk',
    'multiplier', 1.25, 0),
  ('01000000-0000-0000-0000-000000000005', 'attic_fishing',      'Attic or wall fishing required',
    'Running cable requires attic access or drilling through fire blocking — time-intensive',
    'multiplier', 1.20, 1),
  ('01000000-0000-0000-0000-000000000005', 'box_replacement',    'Electrical box replacement',
    'Per box: old work box install, expansion ring, or full replacement',
    'adder', 2500, 2),
  ('01000000-0000-0000-0000-000000000005', 'no_neutral',         'No neutral wire (dimmer / smart switch)',
    'Smart switch or dimmer requires neutral — may not be present in older homes',
    'multiplier', 1.20, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- MOUNTING & INSTALLS
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000006', 'masonry_drilling',   'Masonry / concrete drilling',
    'Tile, concrete block, or brick substrate — hammer drill, anchors, extended setup',
    'multiplier', 1.40, 0),
  ('01000000-0000-0000-0000-000000000006', 'wire_concealment',   'Wire or cable concealment',
    'Running cable in wall or raceway — fish tape, drywall cuts, patching',
    'multiplier', 1.30, 1),
  ('01000000-0000-0000-0000-000000000006', 'blocking_required',  'Blocking or backing required',
    'No studs at mounting location — toggle bolts, surface mounts, or added backing',
    'adder', 1500, 2),
  ('01000000-0000-0000-0000-000000000006', 'heavy_item',         'Heavy item (> 75 lbs)',
    'Two-person lift, lag bolt to stud required, structural review',
    'multiplier', 1.25, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- OUTDOOR & SEASONAL
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000007', 'height_above_10ft',  'Work above 10 ft',
    'Extension ladder setup, additional time for repositioning and safety',
    'multiplier', 1.20, 0),
  ('01000000-0000-0000-0000-000000000007', 'power_washing',      'Power washing required',
    'Surface prep with power washer before staining, painting, or sealing',
    'adder', 7500, 1),
  ('01000000-0000-0000-0000-000000000007', 'debris_removal',     'Debris / haul-away required',
    'Bagging and removal of organic debris, old materials, or waste',
    'adder', 5000, 2),
  ('01000000-0000-0000-0000-000000000007', 'weather_dependency', 'Weather-dependent work',
    'Work cannot proceed in rain or below 50°F — may require return trip coordination',
    'multiplier', 1.10, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- MAINTENANCE & SMALL JOBS
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000008', 'multi_location',     'Multiple locations in home',
    'Tasks spread across different rooms or floors — travel time between locations adds up',
    'multiplier', 1.10, 0),
  ('01000000-0000-0000-0000-000000000008', 'supply_run_required','Supply run required',
    'Job requires sourcing materials day-of — adds 30–60 min transit',
    'adder', 3500, 1)
ON CONFLICT (template_id, key) DO NOTHING;

-- SPECIALTY & EXPANSION
INSERT INTO complexity_factors (template_id, key, label, description, factor_type, default_value, sort_order) VALUES
  ('01000000-0000-0000-0000-000000000009', 'substrate_prep',     'Substrate prep required',
    'Existing surface requires leveling, patching, or skim coat before installation',
    'multiplier', 1.25, 0),
  ('01000000-0000-0000-0000-000000000009', 'pattern_layout',     'Complex pattern or layout',
    'Diagonal tile, herringbone, mosaic, or other non-straight installation',
    'multiplier', 1.30, 1),
  ('01000000-0000-0000-0000-000000000009', 'demo_included',      'Demo / removal included',
    'Existing material must be removed, debris contained, and surface inspected before install',
    'multiplier', 1.20, 2),
  ('01000000-0000-0000-0000-000000000009', 'waterproofing',      'Waterproofing required',
    'Shower, tub surround, or wet area — membrane layer, tape, and mortar bed adds scope',
    'multiplier', 1.25, 3)
ON CONFLICT (template_id, key) DO NOTHING;

-- ============================================================
-- PROFITABILITY RULES
-- ============================================================
INSERT INTO profitability_rules (category, rule_type, value, description) VALUES
  -- Universal floor
  ('all',               'min_service_fee_cents',   12500,  'Minimum charge per visit — covers trip, setup, and minimum 1.5hr labor'),
  ('all',               'min_hourly_rate_cents',    8500,   'Minimum effective hourly rate — $85/hr labor rate'),

  -- Painting: measured in $/sqft labor
  ('painting_finishes', 'min_sqft_rate_cents',      175,    'Minimum $1.75/sqft labor — standard walls only, no prep'),
  ('painting_finishes', 'min_gross_margin_pct',     40,     'Minimum 40% gross margin after materials and handling'),
  ('painting_finishes', 'min_service_fee_cents',    35000,  'Painting minimum — $350 covers mobilization and ~3hr minimum'),

  -- Carpentry
  ('carpentry_furniture','min_gross_margin_pct',    45,     'Minimum 45% gross margin — skilled labor, precise work'),
  ('carpentry_furniture','min_service_fee_cents',   18500,  'Carpentry minimum — $185 for any on-site carpentry work'),

  -- Plumbing
  ('plumbing',          'min_service_fee_cents',    18500,  '$185 minimum — licensed-adjacent work, liability exposure'),
  ('plumbing',          'min_gross_margin_pct',     40,     'Minimum 40% gross margin on plumbing work'),

  -- Electrical
  ('electrical',        'min_service_fee_cents',    18500,  '$185 minimum — safety-critical work, permit risk'),
  ('electrical',        'min_gross_margin_pct',     40,     'Minimum 40% gross margin on electrical work'),

  -- Mounting
  ('mounting_installs', 'min_service_fee_cents',    9500,   '$95 minimum — covers trip and 1hr labor for simple mount'),

  -- Outdoor
  ('outdoor_seasonal',  'min_service_fee_cents',    15000,  '$150 minimum — outdoor mobilization, equipment setup'),

  -- Specialty
  ('specialty_expansion','min_service_fee_cents',   25000,  '$250 minimum — specialty skills, staged work')
ON CONFLICT DO NOTHING;
