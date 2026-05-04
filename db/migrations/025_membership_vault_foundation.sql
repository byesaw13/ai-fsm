-- Migration 025: Membership standards and Digital Home Vault foundation
-- Adds tier/cap/routing fields while preserving existing maintenance plan rows.

ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS membership_tier TEXT NOT NULL DEFAULT 'plus'
    CHECK (membership_tier IN ('essential','plus','premier')),
  ADD COLUMN IF NOT EXISTS annual_visit_count INT NOT NULL DEFAULT 2
    CHECK (annual_visit_count > 0),
  ADD COLUMN IF NOT EXISTS included_labor_minutes_per_visit INT NOT NULL DEFAULT 60
    CHECK (included_labor_minutes_per_visit >= 0),
  ADD COLUMN IF NOT EXISTS billing_cadence TEXT NOT NULL DEFAULT 'annual'
    CHECK (billing_cadence IN ('annual','monthly')),
  ADD COLUMN IF NOT EXISTS annual_price_cents INT NOT NULL DEFAULT 0
    CHECK (annual_price_cents >= 0),
  ADD COLUMN IF NOT EXISTS renewal_date DATE,
  ADD COLUMN IF NOT EXISTS routing_zone TEXT NOT NULL DEFAULT 'core'
    CHECK (routing_zone IN ('core','extended','out_of_area')),
  ADD COLUMN IF NOT EXISTS membership_terms TEXT;

-- Backfill annual price from the legacy per-visit price where possible.
UPDATE maintenance_plans
SET annual_price_cents = price_cents * annual_visit_count
WHERE annual_price_cents = 0
  AND price_cents > 0;

CREATE INDEX IF NOT EXISTS maintenance_plans_tier_idx
  ON maintenance_plans(account_id, membership_tier)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS maintenance_plans_renewal_idx
  ON maintenance_plans(account_id, renewal_date)
  WHERE status = 'active' AND renewal_date IS NOT NULL;

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS membership_visit_phase TEXT NOT NULL DEFAULT 'health_check'
    CHECK (membership_visit_phase IN ('health_check','included_action','reporting')),
  ADD COLUMN IF NOT EXISTS included_labor_cap_minutes INT
    CHECK (included_labor_cap_minutes IS NULL OR included_labor_cap_minutes >= 0),
  ADD COLUMN IF NOT EXISTS included_labor_minutes_used INT NOT NULL DEFAULT 0
    CHECK (included_labor_minutes_used >= 0),
  ADD COLUMN IF NOT EXISTS membership_cap_status TEXT NOT NULL DEFAULT 'within_cap'
    CHECK (membership_cap_status IN ('within_cap','cap_reached','approval_required'));
