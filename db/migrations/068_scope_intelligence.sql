-- Migration 068: Scope Intelligence System
-- Adds the operational estimation layer: scope templates, complexity factors, profitability rules.
-- estimate_scope_snapshots stores what was captured when each estimate line item was built.

-- One template per price_book category — defines what to measure
CREATE TABLE IF NOT EXISTS scope_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL UNIQUE,
  label       text NOT NULL,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Measurable scope inputs for each template
CREATE TABLE IF NOT EXISTS scope_components (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid    NOT NULL REFERENCES scope_templates(id) ON DELETE CASCADE,
  key         text    NOT NULL,
  label       text    NOT NULL,
  unit        text,                -- 'sq ft', 'linear ft', 'count', etc.
  input_type  text    NOT NULL CHECK (input_type IN ('number', 'select', 'boolean')),
  options     jsonb,               -- [{value, label}] for select type
  required    boolean NOT NULL DEFAULT false,
  sort_order  smallint NOT NULL DEFAULT 0,
  UNIQUE (template_id, key)
);

-- Labor/cost modifiers per template
CREATE TABLE IF NOT EXISTS complexity_factors (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id   uuid    NOT NULL REFERENCES scope_templates(id) ON DELETE CASCADE,
  key           text    NOT NULL,
  label         text    NOT NULL,
  description   text,
  factor_type   text    NOT NULL CHECK (factor_type IN ('multiplier', 'adder')),
  -- multiplier: 1.20 = 20% more; adder: flat cents added to total
  default_value numeric(8,4) NOT NULL,
  sort_order    smallint NOT NULL DEFAULT 0,
  UNIQUE (template_id, key)
);

-- Profitability guardrails — enforced during estimate assembly
CREATE TABLE IF NOT EXISTS profitability_rules (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text    NOT NULL,   -- matches price_book.category or 'all'
  rule_type   text    NOT NULL CHECK (rule_type IN (
    'min_sqft_rate_cents',
    'min_gross_margin_pct',
    'min_service_fee_cents',
    'min_hourly_rate_cents'
  )),
  value       numeric(10,4) NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Stores scope inputs captured when an estimate line item was built
CREATE TABLE IF NOT EXISTS estimate_scope_snapshots (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_line_item_id uuid NOT NULL REFERENCES estimate_line_items(id) ON DELETE CASCADE,
  template_id           uuid REFERENCES scope_templates(id) ON DELETE SET NULL,
  components            jsonb NOT NULL DEFAULT '{}',  -- {wall_sqft: 1200, door_count: 2}
  complexity            jsonb NOT NULL DEFAULT '{}',  -- {occupied_home: true, dark_to_light: false}
  computed_modifier     numeric(6,4) NOT NULL DEFAULT 1.0,  -- final combined multiplier applied
  base_price_cents      integer,                             -- price before modifier
  adjusted_price_cents  integer,                            -- price after modifier
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scope_snapshots_line_item
  ON estimate_scope_snapshots (estimate_line_item_id);

CREATE INDEX IF NOT EXISTS idx_scope_snapshots_template
  ON estimate_scope_snapshots (template_id);
