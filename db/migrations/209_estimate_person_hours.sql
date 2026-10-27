-- Migration 209: person-hours on every estimate (TASK-191).
-- Null hours mean not entered. Missing is never stored as 0.
-- The previous application does not read or write these columns.
-- unit_cost_cents is already migration 208. The equipment line type is TASK-192.
-- hours_per_day is in the B2 plan (default 8); the TASK-188 sketch omitted it.
-- Additive only. No backfill.

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS hours_low numeric(8,2),
  ADD COLUMN IF NOT EXISTS hours_high numeric(8,2),
  ADD COLUMN IF NOT EXISTS hours_source text,
  ADD COLUMN IF NOT EXISTS production_rate_snapshot jsonb;

ALTER TABLE estimate_line_items
  DROP CONSTRAINT IF EXISTS estimate_line_items_hours_source_check;
ALTER TABLE estimate_line_items
  ADD CONSTRAINT estimate_line_items_hours_source_check
  CHECK (hours_source IS NULL OR hours_source IN (
    'owner', 'price_book', 'production_rate', 'ai_allowance', 'revision', 'travel_calc'
  ));

ALTER TABLE estimate_line_items
  DROP CONSTRAINT IF EXISTS estimate_line_items_hours_range_check;
ALTER TABLE estimate_line_items
  ADD CONSTRAINT estimate_line_items_hours_range_check
  CHECK (
    hours_low IS NULL
    OR hours_high IS NULL
    OR (hours_low >= 0 AND hours_low <= hours_high)
  );

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS labor_hours_low numeric(8,2),
  ADD COLUMN IF NOT EXISTS labor_hours_high numeric(8,2),
  ADD COLUMN IF NOT EXISTS labor_hours_source text,
  ADD COLUMN IF NOT EXISTS handling_in_baseline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS other_direct_cost_cents integer,
  ADD COLUMN IF NOT EXISTS direct_costs_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_floor_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS cost_floor_ack_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS baseline_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS review_result jsonb,
  ADD COLUMN IF NOT EXISTS review_for_updated_at timestamptz;

ALTER TABLE estimates
  DROP CONSTRAINT IF EXISTS estimates_labor_hours_source_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_labor_hours_source_check
  CHECK (labor_hours_source IS NULL OR labor_hours_source IN (
    'owner', 'price_book', 'production_rate', 'ai_allowance', 'revision', 'travel_calc'
  ));

ALTER TABLE estimates
  DROP CONSTRAINT IF EXISTS estimates_labor_hours_range_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_labor_hours_range_check
  CHECK (
    labor_hours_low IS NULL
    OR labor_hours_high IS NULL
    OR (labor_hours_low >= 0 AND labor_hours_low <= labor_hours_high)
  );

ALTER TABLE estimates
  DROP CONSTRAINT IF EXISTS estimates_other_direct_cost_cents_check;
ALTER TABLE estimates
  ADD CONSTRAINT estimates_other_direct_cost_cents_check
  CHECK (other_direct_cost_cents IS NULL OR other_direct_cost_cents >= 0);

ALTER TABLE business_pricing_settings
  ADD COLUMN IF NOT EXISTS baseline_warning_pct numeric(5,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS hours_per_day numeric(4,2) NOT NULL DEFAULT 8;

ALTER TABLE business_pricing_settings
  DROP CONSTRAINT IF EXISTS business_pricing_settings_baseline_warning_pct_check;
ALTER TABLE business_pricing_settings
  ADD CONSTRAINT business_pricing_settings_baseline_warning_pct_check
  CHECK (baseline_warning_pct >= 0 AND baseline_warning_pct <= 100);

ALTER TABLE business_pricing_settings
  DROP CONSTRAINT IF EXISTS business_pricing_settings_hours_per_day_check;
ALTER TABLE business_pricing_settings
  ADD CONSTRAINT business_pricing_settings_hours_per_day_check
  CHECK (hours_per_day > 0 AND hours_per_day <= 24);

ALTER TABLE production_rates
  ADD COLUMN IF NOT EXISTS calibrated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calibrated_at timestamptz;

ALTER TABLE production_rate_modifiers
  ADD COLUMN IF NOT EXISTS calibrated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calibrated_at timestamptz;

-- Reversal:
-- ALTER TABLE production_rate_modifiers DROP COLUMN IF EXISTS calibrated_at;
-- ALTER TABLE production_rate_modifiers DROP COLUMN IF EXISTS calibrated;
-- ALTER TABLE production_rates DROP COLUMN IF EXISTS calibrated_at;
-- ALTER TABLE production_rates DROP COLUMN IF EXISTS calibrated;
-- ALTER TABLE business_pricing_settings DROP CONSTRAINT IF EXISTS business_pricing_settings_hours_per_day_check;
-- ALTER TABLE business_pricing_settings DROP CONSTRAINT IF EXISTS business_pricing_settings_baseline_warning_pct_check;
-- ALTER TABLE business_pricing_settings DROP COLUMN IF EXISTS hours_per_day;
-- ALTER TABLE business_pricing_settings DROP COLUMN IF EXISTS baseline_warning_pct;
-- ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_other_direct_cost_cents_check;
-- ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_labor_hours_range_check;
-- ALTER TABLE estimates DROP CONSTRAINT IF EXISTS estimates_labor_hours_source_check;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS review_for_updated_at;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS review_result;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS baseline_snapshot;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS cost_floor_ack_by;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS cost_floor_ack_at;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS direct_costs_confirmed_at;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS other_direct_cost_cents;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS handling_in_baseline;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS labor_hours_source;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS labor_hours_high;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS labor_hours_low;
-- ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_hours_range_check;
-- ALTER TABLE estimate_line_items DROP CONSTRAINT IF EXISTS estimate_line_items_hours_source_check;
-- ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS production_rate_snapshot;
-- ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS hours_source;
-- ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS hours_high;
-- ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS hours_low;
