-- Production rate anchors: labor throughput benchmarks per service code.
-- Used to compute implied labor days from scope area and complexity factors,
-- surfaced in the ScopeBuilder as a sanity-check alongside flat pricing.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS production_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code    TEXT NOT NULL REFERENCES price_book(code) ON DELETE CASCADE,
  scope_component_key TEXT NOT NULL,         -- which scope value drives calculation (e.g. 'sqft')
  base_rate       NUMERIC(10,2) NOT NULL,    -- units per day at baseline conditions
  rate_unit       TEXT NOT NULL              -- 'sqft_per_day' | 'sqft_per_hour' | 'linear_ft_per_day' | 'units_per_day'
    CHECK (rate_unit IN ('sqft_per_day','sqft_per_hour','linear_ft_per_day','units_per_day')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_code, scope_component_key)
);

CREATE TABLE IF NOT EXISTS production_rate_modifiers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_code          TEXT NOT NULL REFERENCES price_book(code) ON DELETE CASCADE,
  complexity_factor_key TEXT NOT NULL,
  modifier_pct          NUMERIC(6,4) NOT NULL,   -- e.g. -0.15 = 15% production penalty
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service_code, complexity_factor_key)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_production_rates_service_code
  ON production_rates(service_code);

CREATE INDEX IF NOT EXISTS idx_production_rate_modifiers_service_code
  ON production_rate_modifiers(service_code);

-- ---------------------------------------------------------------------------
-- Flooring seed data
-- ---------------------------------------------------------------------------

-- LVP flooring installation (9010): 175 sqft/day baseline
INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('9010', 'sqft', 175, 'sqft_per_day',
   'Click-lock LVP on flat concrete or wood subfloor. Solo installer. Includes layout, cuts, transitions.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

INSERT INTO production_rate_modifiers (service_code, complexity_factor_key, modifier_pct, notes) VALUES
  ('9010', 'complex_layout',  -0.15, 'Posts, bump-outs, diagonal runs — extra layout and cut time'),
  ('9010', 'furnished_room',  -0.20, 'Moving and staging furniture around install area'),
  ('9010', 'demo_included',   -0.25, 'Flooring removal adds significant time before install begins'),
  ('9010', 'multi_trip_cure', -0.05, 'Second visit: room is empty and prepped — minor throughput loss')
ON CONFLICT (service_code, complexity_factor_key) DO NOTHING;

-- Concrete subfloor prep / skim coat (9011): 100 sqft/day baseline
INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('9011', 'sqft', 100, 'sqft_per_day',
   'Grinding high spots, feather-skim, primer. Highly variable — treat as minimum; quote on-site.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

INSERT INTO production_rate_modifiers (service_code, complexity_factor_key, modifier_pct, notes) VALUES
  ('9011', 'complex_layout', -0.10, 'Obstacles and tight areas slow grinding and trowel work')
ON CONFLICT (service_code, complexity_factor_key) DO NOTHING;

-- Self-leveling compound (9012): 200 sqft/day baseline (pour + spread is fast; prep and mixing is the bottleneck)
INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('9012', 'sqft', 200, 'sqft_per_day',
   'Pour and spread self-leveler. Rate is limited by mixing throughput and primer cure wait.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

-- Existing flooring removal (9013): 300 sqft/day baseline
INSERT INTO production_rates (service_code, scope_component_key, base_rate, rate_unit, notes) VALUES
  ('9013', 'sqft', 300, 'sqft_per_day',
   'Removal of carpet, vinyl, laminate. Includes debris bagging. Tile removal is slower — use 9013 rate as optimistic baseline for non-tile.')
ON CONFLICT (service_code, scope_component_key) DO NOTHING;

INSERT INTO production_rate_modifiers (service_code, complexity_factor_key, modifier_pct, notes) VALUES
  ('9013', 'complex_layout', -0.15, 'Notching around posts and obstacles slows demo')
ON CONFLICT (service_code, complexity_factor_key) DO NOTHING;
