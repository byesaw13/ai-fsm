-- Painting trade production anchors and full-room service code.
-- The painting_finishes scope template, complexity factors, and service_materials
-- already exist (069_scope_data.sql, 071_service_materials_data.sql).
-- This migration adds:
--   1. 5012 — Interior room painting (sqft-based, AI-addressable full-room service)
--   2. production_rates + production_rate_modifiers for key painting_finishes codes

-- ---------------------------------------------------------------------------
-- New service: full-room interior painting
-- ---------------------------------------------------------------------------

-- default_price_cents = 325 is the per-sqft rate in cents ($3.25/sqft).
-- unit_type = 'per_sqft' tells the ScopeBuilder to compute price as rate × wall_sqft.
-- price_min_cents = 9500 is the flat minimum ($95) for very small jobs.
INSERT INTO price_book (code, name, category, tier, price_min_cents, price_max_cents,
  default_price_cents, unit_type, description, notes, default_labor_hours, requires_materials, upsell_codes) VALUES
('5012', 'Interior room painting', 'painting_finishes', 'standard', 9500, NULL,
  325, 'per_sqft',
  'Full room interior painting — walls, optional ceiling and trim. Layout, surface prep, two finish coats. Priced at $3.25/sqft of wall area.',
  'Quote by wall_sqft. Ceiling and trim scope are additive. Excludes wallpaper removal.',
  NULL, true, ARRAY['5009','1002','5003'])
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Production rates
-- ---------------------------------------------------------------------------

INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('5012', 'wall_sqft',       200, 'sqft_per_day',
   'Interior walls, 2 finish coats, standard prep (fill holes, light sand, wipe). Solo painter.'),
  ('5003', 'trim_linear_ft',  120, 'linear_ft_per_day',
   'Baseboard and casing, brush-cut then roll flat sections. Standard 3.5" profile.'),
  ('5002', 'door_count',        6, 'units_per_day',
   'Interior door both sides, brush coat, light sand between coats. Standard 6-panel or flush.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Production rate modifiers
-- ---------------------------------------------------------------------------

INSERT INTO production_rate_modifiers (service_code, complexity_factor_key, modifier_pct, notes) VALUES
  -- 5012 interior room painting
  ('5012', 'dark_to_light',      -0.20, 'Full prime coat required before finish — adds one complete pass'),
  ('5012', 'nicotine_staining',  -0.30, 'Stain-blocking seal coat required — BIN or shellac, full walls before finish'),
  ('5012', 'occupied_home',      -0.10, 'Furniture protection, daily access coordination, careful masking around belongings'),
  ('5012', 'vaulted_ceilings',   -0.15, 'Ladder repositioning, extra setup time, working at height'),
  ('5012', 'difficult_masking',  -0.15, 'Built-ins, crown molding, chair rail — detailed edge work throughout'),
  ('5012', 'texture_match',      -0.15, 'Texture matching on patches slows prep phase'),
  -- 5003 trim painting
  ('5003', 'difficult_masking',  -0.20, 'Complex trim profiles (crown, chair rail, multiple layers) require more cut-in time')
ON CONFLICT (service_code, complexity_factor_key) DO NOTHING;
