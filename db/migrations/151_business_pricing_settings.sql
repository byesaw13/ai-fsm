-- Migration 151: Account-level labor pricing settings
-- Owner-adjustable cost rate (pay), customer bill rate, margin floor, MA delta.
-- Used by estimates (margin guardrails), T&M drafts, invoices, and travel "standard labor".

CREATE TABLE IF NOT EXISTS business_pricing_settings (
  account_id                      UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  -- What the business costs per billable hour (owner pay / burdened cost clock).
  -- Used for margin math only — never shown on customer documents.
  labor_cost_cents_per_hour       INTEGER NOT NULL DEFAULT 5000
    CHECK (labor_cost_cents_per_hour >= 0 AND labor_cost_cents_per_hour <= 50000),
  -- Customer-facing T&M / add-on labor rate (NH baseline).
  labor_billing_cents_per_hour    INTEGER NOT NULL DEFAULT 11500
    CHECK (labor_billing_cents_per_hour >= 0 AND labor_billing_cents_per_hour <= 100000),
  -- Gross margin floor (0–1). Estimates below this are blocked.
  margin_floor_pct                NUMERIC(5,4) NOT NULL DEFAULT 0.3000
    CHECK (margin_floor_pct >= 0 AND margin_floor_pct <= 1),
  -- Multiplier applied to billing rate for MA jobs (e.g. 0.15 = +15%).
  ma_labor_rate_delta             NUMERIC(5,4) NOT NULL DEFAULT 0.1500
    CHECK (ma_labor_rate_delta >= 0 AND ma_labor_rate_delta <= 1),
  minimum_service_fee_cents       INTEGER NOT NULL DEFAULT 18500
    CHECK (minimum_service_fee_cents >= 0),
  half_day_rate_cents             INTEGER NOT NULL DEFAULT 51500
    CHECK (half_day_rate_cents >= 0),
  full_day_rate_cents             INTEGER NOT NULL DEFAULT 98000
    CHECK (full_day_rate_cents >= 0),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Bill rate must cover cost rate (sanity)
  CONSTRAINT business_pricing_bill_covers_cost
    CHECK (labor_billing_cents_per_hour >= labor_cost_cents_per_hour)
);

CREATE TRIGGER trg_business_pricing_settings_updated_at
  BEFORE UPDATE ON business_pricing_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE business_pricing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_pricing_settings FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_pricing_settings' AND policyname = 'business_pricing_settings_select'
  ) THEN
    CREATE POLICY business_pricing_settings_select ON business_pricing_settings
      FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_pricing_settings' AND policyname = 'business_pricing_settings_insert'
  ) THEN
    CREATE POLICY business_pricing_settings_insert ON business_pricing_settings
      FOR INSERT WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_pricing_settings' AND policyname = 'business_pricing_settings_update'
  ) THEN
    CREATE POLICY business_pricing_settings_update ON business_pricing_settings
      FOR UPDATE
      USING (account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

-- Seed defaults for existing accounts ($50 cost / $115 bill)
INSERT INTO business_pricing_settings (account_id)
SELECT id FROM accounts
ON CONFLICT (account_id) DO NOTHING;

COMMENT ON TABLE business_pricing_settings IS
  'Per-account labor cost, bill rates, and margin floor. Source of truth for T&M and estimate margin checks.';

-- DOWN
-- DROP TABLE IF EXISTS business_pricing_settings;
