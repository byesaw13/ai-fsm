-- Migration 071: Service Materials — Seed Data
-- Quantity formulas derived from industry standards and real Dovetails job history.
-- Coverage rates: paint 350 sqft/gal, primer 250 sqft/gal, joint compound 24 sqft/qt
-- Waste factors: paint 10%, trim 10%, drywall 15%, tile 10%
-- Material costs: 2025/2026 New England pricing (Home Depot / Sherwin-Williams)

-- ============================================================
-- PAINTING & FINISHES — category-level rules (apply to all painting jobs)
-- ============================================================

-- Finish coat paint: wall_sqft / 350 per coat, 10% waste, ~$55/gal (SW ProMar 200 or equiv)
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('painting_finishes', 'Interior latex paint (finish coat)',
  'Sherwin-Williams ProMar 200 or equivalent — 1 gal covers 350 sqft. Qty = wall_sqft / 350 per coat, +10% waste.',
  'per_coverage', 'wall_sqft', 350, 1.10, 'gallon', 5500, 'Paint & Supplies', 0),

-- Ceiling paint: ceiling_sqft / 350, 10% waste
('painting_finishes', 'Ceiling paint (flat white)',
  'Flat ceiling white — 1 gal covers 350 sqft.',
  'per_coverage', 'ceiling_sqft', 350, 1.10, 'gallon', 4500, 'Paint & Supplies', 1),

-- Primer (conditional: dark-to-light or nicotine staining)
('painting_finishes', 'Stain-blocking primer (BIN or Zinsser)',
  'Required for dark-to-light transitions or nicotine staining. 1 gal covers 250 sqft.',
  'per_coverage', 'wall_sqft', 250, 1.10, 'gallon', 4800, 'Paint & Supplies', 2),

-- Trim paint: trim_linear_ft / 150 (semi-gloss quart covers ~150 LF of baseboard)
('painting_finishes', 'Trim paint — semi-gloss (quart)',
  'Semi-gloss trim paint. 1 quart covers approx 150 LF of standard baseboard.',
  'per_coverage', 'trim_linear_ft', 150, 1.10, 'quart', 2200, 'Paint & Supplies', 3),

-- Roller covers: 1 per 300 sqft
('painting_finishes', '9" roller cover (3/8" nap)',
  '3/8" nap for smooth to light-texture walls. Replace every 300 sqft.',
  'per_coverage', 'wall_sqft', 300, 1.0, 'each', 450, 'Paint & Supplies', 4),

-- Painter's tape: 1 roll per 150 LF of taping lines (trim + windows + doors)
('painting_finishes', 'Painter''s tape (FrogTape or 3M)',
  '1 roll covers approx 150 LF of trim and edge work. Also used for window/door masking.',
  'per_coverage', 'trim_linear_ft', 150, 1.0, 'roll', 850, 'Paint & Supplies', 5),

-- Drop cloth / plastic: 1 per 200 sqft of floor to protect
('painting_finishes', 'Plastic sheeting / drop cloth (9×12 canvas)',
  '9×12 canvas drop cloth per 200 sqft of floor area to protect.',
  'per_coverage', 'wall_sqft', 400, 1.0, 'each', 2200, 'Paint & Supplies', 6),

-- Caulk for trim gaps: 1 tube per 40 LF
('painting_finishes', 'Paintable latex caulk (Alex Plus)',
  '1 tube covers 40 LF of trim gaps and wall-to-trim joints. Always required for quality finish.',
  'per_coverage', 'trim_linear_ft', 40, 1.0, 'tube', 650, 'Paint & Supplies', 7),

-- Patch compound for holes: 1 tube spackling per 100 sqft of walls (standard prep)
('painting_finishes', 'Spackling / lightweight patch compound (quart)',
  'Lightweight spackling for nail holes, minor dings, and small cracks. 1 qt covers avg room prep.',
  'static', NULL, NULL, 1.0, 'quart', 1200, 'Paint & Supplies', 8),

-- Primer for patches only (when texture match NOT required — just sealing)
('painting_finishes', 'Spot sealing primer (spray can)',
  'Seals joint compound patches before topcoat. Prevents flashing. 1 can per job.',
  'static', NULL, NULL, 1.0, 'each', 950, 'Paint & Supplies', 9)
ON CONFLICT DO NOTHING;

-- Primer for dark-to-light: conditional on complexity factor
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('painting_finishes', 'Primer — extra gallon (dark-to-light)',
  'Second primer pass required for dark-to-light transitions. Add 1 extra gallon.',
  'per_coverage', 'wall_sqft', 250, 1.10, 'gallon', 4800, 'Paint & Supplies', 'dark_to_light', 2),
('painting_finishes', 'Trisodium phosphate (TSP) cleaner — nicotine prep',
  'Surface must be cleaned with TSP before priming on smoke/nicotine-stained surfaces.',
  'static', NULL, NULL, 1.0, 'box', 950, 'Paint & Supplies', 'nicotine_staining', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- CARPENTRY & FURNITURE — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('carpentry_furniture', 'Brad nails — 18-gauge 2" (box of 1000)',
  '18ga 2" brad nails for trim, baseboard, and light carpentry. 1 box per 100 LF or 5 pieces.',
  'per_coverage', 'linear_feet', 100, 1.0, 'box', 1200, 'Hardware & Fasteners', 0),

('carpentry_furniture', 'Paintable latex caulk (Alex Plus)',
  '1 tube covers 40 LF of trim-to-wall joints and scribe lines.',
  'per_coverage', 'linear_feet', 40, 1.0, 'tube', 650, 'Hardware & Fasteners', 1),

('carpentry_furniture', 'Wood filler — stainable/paintable (tube)',
  '1 tube fills nail holes for approx 50 LF of installed trim.',
  'per_coverage', 'linear_feet', 50, 1.0, 'tube', 750, 'Hardware & Fasteners', 2),

('carpentry_furniture', 'Sandpaper — 120/220 grit assortment (pack)',
  '1 pack per carpentry job for edge sanding and surface prep.',
  'static', NULL, NULL, 1.0, 'pack', 650, 'Hardware & Fasteners', 3),

('carpentry_furniture', 'Construction adhesive (Liquid Nails)',
  'Heavy-duty panel adhesive for shelving and built-in backing. 1 tube per 4 pieces or 20 LF.',
  'per_coverage', 'linear_feet', 20, 1.0, 'tube', 850, 'Hardware & Fasteners', 4),

('carpentry_furniture', 'Wood screws — coarse thread #8 3" (lb)',
  'For structural attachment into studs and framing. 1 lb per 20 LF of built-in.',
  'per_coverage', 'linear_feet', 20, 1.0, 'lb', 1200, 'Hardware & Fasteners', 5)
ON CONFLICT DO NOTHING;

-- Wall anchors: conditional on wall_anchoring complexity factor
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('carpentry_furniture', 'Heavy-duty wall anchors / toggle bolts (10-pack)',
  'For secure wall attachment when stud location does not align. 1 pack per 4 anchor points.',
  'per_coverage', 'piece_count', 4, 1.0, 'pack', 950, 'Hardware & Fasteners', 'wall_anchoring', 6)
ON CONFLICT DO NOTHING;

-- ============================================================
-- GENERAL REPAIRS — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('general_repairs', 'Joint compound — all-purpose (quart)',
  'For drywall patches up to 12" diameter. 1 quart covers approx 24 sqft of patching.',
  'per_coverage', 'drywall_sqft', 24, 1.15, 'quart', 1100, 'Building Materials', 0),

('general_repairs', 'Drywall mesh tape — self-adhesive (50ft roll)',
  'Fiberglass mesh tape for joints and crack repairs. 1 roll per job up to 5 patches.',
  'static', NULL, NULL, 1.0, 'roll', 650, 'Building Materials', 1),

('general_repairs', 'Drywall screws — fine thread 1-5/8" (1lb)',
  'For securing patch pieces and corner bead.',
  'static', NULL, NULL, 1.0, 'lb', 650, 'Building Materials', 2),

('general_repairs', 'Spot-sealing primer — spray (12oz can)',
  'Seals joint compound patches before topcoat. Critical to prevent flashing.',
  'static', NULL, NULL, 1.0, 'can', 950, 'Paint & Supplies', 3),

('general_repairs', 'Paintable caulk (Alex Plus) — general repairs',
  'Window sills, door frames, baseboards, transitions. 1 tube per 2–3 repair locations.',
  'per_coverage', 'repair_count', 3, 1.0, 'tube', 650, 'Paint & Supplies', 4)
ON CONFLICT DO NOTHING;

-- Drywall sheet: only when large patch
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('general_repairs', 'Drywall sheet — 1/2" 4×8 (each)',
  'For patches larger than 12". qty = drywall_sqft / 24 with 15% waste.',
  'per_coverage', 'drywall_sqft', 24, 1.15, 'sheet', 1600, 'Building Materials', 5)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PLUMBING — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('plumbing', 'Braided stainless supply line — 12" (pair)',
  '1 pair (hot + cold) per fixture replacement. Universal fit for most faucets, toilets, shut-offs.',
  'per_component', 'fixture_count', 1, 1.0, 'pair', 1800, 'Plumbing', 0),

('plumbing', 'PTFE thread tape — 3/4" (roll)',
  'Thread seal tape for all threaded connections. 1 roll per job covers all connections.',
  'static', NULL, NULL, 1.0, 'roll', 250, 'Plumbing', 1),

('plumbing', 'Plumber''s putty — 14oz',
  'For faucet deck plate and drain flange sealing. 1 tub per fixture installation.',
  'static', NULL, NULL, 1.0, 'tub', 750, 'Plumbing', 2),

('plumbing', 'P-trap — 1-1/2" PVC chrome (complete)',
  'For drain reassembly after under-sink work. Include when access_type = under_sink.',
  'static', NULL, NULL, 1.0, 'each', 1400, 'Plumbing', 3),

('plumbing', 'Silicone sealant — clear (small tube)',
  'Around drain flanges and fixture bases where putty is not appropriate.',
  'static', NULL, NULL, 1.0, 'tube', 850, 'Plumbing', 4)
ON CONFLICT DO NOTHING;

-- Shutoff valve: conditional on shutoff_valve_replace complexity factor
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('plumbing', 'Quarter-turn ball valve shutoff — 3/8" OD compression',
  'Replacement shutoff valve. 1 per shutoff being replaced. Most common size for sink and toilet.',
  'per_component', 'fixture_count', 1, 1.0, 'each', 2200, 'Plumbing', 'shutoff_valve_replace', 5)
ON CONFLICT DO NOTHING;

-- ============================================================
-- ELECTRICAL — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('electrical', 'Outlet / switch receptacle (standard or GFCI)',
  '1 replacement device per outlet/switch. GFCI where required by code (kitchen, bath, garage).',
  'per_component', 'outlet_count', 1, 1.0, 'each', 850, 'Electrical', 0),

('electrical', 'Decora cover plate — 1-gang (each)',
  '1 cover plate per outlet or switch. Coordinate finish with client (white/ivory/light almond).',
  'per_component', 'outlet_count', 1, 1.0, 'each', 200, 'Electrical', 1),

('electrical', 'Wire nuts — assorted pack (20 count)',
  '2-3 wire nuts per outlet. 1 pack per 5 outlets.',
  'per_coverage', 'outlet_count', 5, 1.0, 'pack', 450, 'Electrical', 2),

('electrical', 'Electrical tape — 3/4" vinyl (roll)',
  'For wire insulation and bundling. 1 roll per job.',
  'static', NULL, NULL, 1.0, 'roll', 250, 'Electrical', 3)
ON CONFLICT DO NOTHING;

-- Old work box: conditional on box_replacement factor
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('electrical', 'Old-work electrical box — 1-gang plastic',
  'Replacement box for damaged, undersized, or missing boxes. 1 per box being replaced.',
  'per_component', 'outlet_count', 1, 1.0, 'each', 450, 'Electrical', 'box_replacement', 4)
ON CONFLICT DO NOTHING;

-- ============================================================
-- MOUNTING & INSTALLS — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('mounting_installs', 'Lag bolts — 5/16" × 3" (4-pack)',
  '4 lag bolts per mount into wood studs. 1 pack per 1-2 items mounted to stud.',
  'per_coverage', 'item_count', 2, 1.0, 'pack', 650, 'Hardware & Fasteners', 0),

('mounting_installs', 'Wall anchors — toggle bolt assortment (10-pack)',
  'For mounting when stud location does not align. 1 pack per 2 items without stud access.',
  'per_coverage', 'item_count', 2, 1.0, 'pack', 950, 'Hardware & Fasteners', 1),

('mounting_installs', 'Wood screws — #10 × 2-1/2" (lb)',
  'For lighter mounting work and shelf hardware. 1 lb per 5 items.',
  'per_coverage', 'item_count', 5, 1.0, 'lb', 1100, 'Hardware & Fasteners', 2)
ON CONFLICT DO NOTHING;

-- Cable raceway: conditional on wire_concealment factor
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('mounting_installs', 'Paintable cord raceway kit — 5 ft sections',
  'For concealing TV/AV cables on wall surface without in-wall routing. Paintable white.',
  'static', NULL, NULL, 1.0, 'kit', 2800, 'Hardware & Fasteners', 'wire_concealment', 3),

('mounting_installs', 'HDMI cable — 6 ft high speed',
  'Required when routing or replacing AV cables. 1 per display being mounted.',
  'per_component', 'item_count', 1, 1.0, 'each', 1200, 'Electrical', 'wire_concealment', 4)
ON CONFLICT DO NOTHING;

-- Masonry anchors: conditional on masonry_drilling factor
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('mounting_installs', 'Concrete/masonry anchors — 1/4" × 1-1/4" (25-pack)',
  'Sleeve anchors or Tapcon screws for concrete, brick, or block substrate.',
  'per_coverage', 'item_count', 3, 1.0, 'pack', 1400, 'Hardware & Fasteners', 'masonry_drilling', 5)
ON CONFLICT DO NOTHING;

-- ============================================================
-- OUTDOOR & SEASONAL — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('outdoor_seasonal', 'Exterior paintable caulk (Alex Plus Exterior)',
  'For window frames, door frames, siding gaps. 1 tube per 30 LF of exterior gap sealing.',
  'per_coverage', 'linear_feet', 30, 1.0, 'tube', 750, 'Paint & Supplies', 0),

('outdoor_seasonal', 'Deck screws — #10 × 3" coated exterior (lb)',
  'For deck board fastening and repairs. 1 lb per 50 LF of decking.',
  'per_coverage', 'linear_feet', 50, 1.0, 'lb', 1400, 'Hardware & Fasteners', 1),

('outdoor_seasonal', 'Exterior wood filler — 2-part epoxy',
  'For rotted wood repair on sills, trim, and decking. 1 kit per repair location.',
  'per_component', 'repair_count', 1, 1.0, 'kit', 1800, 'Building Materials', 2)
ON CONFLICT DO NOTHING;

-- Power washing: conditional
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('outdoor_seasonal', 'Deck/concrete cleaner concentrate — 1 gal',
  'Used before power washing composite decks or concrete. 1 gallon treats up to 800 sqft.',
  'per_coverage', 'sqft', 800, 1.0, 'gallon', 1800, 'Outdoor & Garden', 'power_washing', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- MAINTENANCE & SMALL JOBS — category-level rules
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('maintenance_small', 'Weatherstripping — door sweep foam (10ft roll)',
  'Self-adhesive foam weatherstrip for door gaps. 1 roll per door.',
  'static', NULL, NULL, 1.0, 'roll', 850, 'Hardware & Fasteners', 0),

('maintenance_small', 'Door sweep — heavy duty (36" aluminum)',
  'Bottom door sweep for exterior doors with significant gap. 1 per door.',
  'static', NULL, NULL, 1.0, 'each', 2200, 'Hardware & Fasteners', 1),

('maintenance_small', 'Silicone caulk — clear multi-purpose',
  'General purpose repairs: tub/shower joints, window weep holes, utility penetrations.',
  'static', NULL, NULL, 1.0, 'tube', 750, 'Paint & Supplies', 2),

('maintenance_small', 'Lubricant — WD-40 + 3-in-1 oil (combo)',
  'Squeaky hinges, sticky locks, sliding tracks. Standard kit for maintenance visits.',
  'static', NULL, NULL, 1.0, 'each', 950, 'Hardware & Fasteners', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SPECIALTY & EXPANSION — tile/flooring
-- ============================================================
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, sort_order) VALUES
('specialty_expansion', 'Tile adhesive / thinset mortar — 50lb bag',
  '1 bag covers approx 40 sqft of tile installation at standard thickness.',
  'per_coverage', 'sqft', 40, 1.10, 'bag', 2800, 'Building Materials', 0),

('specialty_expansion', 'Tile grout — sanded (10lb bag)',
  '1 bag covers approx 50 sqft at standard joint spacing.',
  'per_coverage', 'sqft', 50, 1.10, 'bag', 1800, 'Building Materials', 1),

('specialty_expansion', 'Grout sealer — 24oz spray',
  '1 bottle treats approx 200 sqft of installed grout.',
  'per_coverage', 'sqft', 200, 1.0, 'bottle', 1400, 'Building Materials', 2),

('specialty_expansion', 'Tile spacers — 1/8" (pack of 250)',
  '1 pack per 30 sqft of tile installed.',
  'per_coverage', 'sqft', 30, 1.0, 'pack', 550, 'Building Materials', 3),

('specialty_expansion', 'Backer board — HardieBacker 3×5 (each)',
  'Cement backer for wet areas. 1 sheet (15 sqft) per 15 sqft of wet-area tile.',
  'per_coverage', 'sqft', 15, 1.10, 'sheet', 1600, 'Building Materials', 4)
ON CONFLICT DO NOTHING;

-- Waterproofing membrane: conditional
INSERT INTO service_materials (category, material_name, description, quantity_type, scope_component_key, quantity_multiplier, waste_factor, unit, unit_cost_cents, store_section, condition_factor_key, sort_order) VALUES
('specialty_expansion', 'RedGard waterproofing membrane — 1 gal',
  'For shower pans and tub surrounds. 1 gal covers approx 35 sqft at 2 coats.',
  'per_coverage', 'sqft', 35, 1.0, 'gallon', 3800, 'Building Materials', 'waterproofing', 5)
ON CONFLICT DO NOTHING;
