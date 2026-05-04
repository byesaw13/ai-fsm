-- Migration 026: Dovetails estimate pricing guardrails
-- Adds v2.0 pricing strategy fields, typed adjustments, and review state.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS trip_count TEXT NOT NULL DEFAULT 'one_trip'
    CHECK (trip_count IN ('one_trip', 'multi_trip')),
  ADD COLUMN IF NOT EXISTS requires_drying_or_curing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS difficult_access BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS old_house_risk BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coordination_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finish_expectation TEXT NOT NULL DEFAULT 'clean'
    CHECK (finish_expectation IN ('basic', 'clean', 'premium')),
  ADD COLUMN IF NOT EXISTS travel_surcharge_cents INT NOT NULL DEFAULT 0
    CHECK (travel_surcharge_cents >= 0),
  ADD COLUMN IF NOT EXISTS risk_adjustment_cents INT NOT NULL DEFAULT 0
    CHECK (risk_adjustment_cents >= 0),
  ADD COLUMN IF NOT EXISTS minimum_service_override_reason TEXT
    CHECK (
      minimum_service_override_reason IS NULL
      OR minimum_service_override_reason IN ('bundled', 'membership_included', 'promo', 'owner_approved')
    ),
  ADD COLUMN IF NOT EXISTS minimum_service_override_note TEXT,
  ADD COLUMN IF NOT EXISTS pricing_review_status TEXT NOT NULL DEFAULT 'needs_review'
    CHECK (pricing_review_status IN ('needs_review', 'passed', 'blocked')),
  ADD COLUMN IF NOT EXISTS pricing_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pricing_reviewed_by UUID REFERENCES users(id);

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS adjustment_type TEXT
    CHECK (
      adjustment_type IS NULL
      OR adjustment_type IN (
        'bundle_credit',
        'member_credit',
        'promo',
        'travel_surcharge',
        'risk_adjustment',
        'return_trip_charge',
        'coordination_fee'
      )
    );

CREATE INDEX IF NOT EXISTS estimates_pricing_review_status_idx
  ON estimates(account_id, pricing_review_status);
