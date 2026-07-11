-- Migration 148: Travel & Mileage Charging System
-- Configurable business origin, mileage rates, travel calculation snapshots,
-- and per-client travel rules. Attaches snapshots to estimates, invoices,
-- work orders, and visits.

-- ---------------------------------------------------------------------------
-- business_travel_settings (one row per account)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_travel_settings (
  account_id                      UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  origin_address                  TEXT NOT NULL DEFAULT '85 Rockingham Road',
  origin_city                     TEXT NOT NULL DEFAULT 'Derry',
  origin_state                    TEXT NOT NULL DEFAULT 'NH',
  origin_zip                      TEXT NOT NULL DEFAULT '03038',
  origin_latitude                 DOUBLE PRECISION,
  origin_longitude                DOUBLE PRECISION,
  included_one_way_miles          NUMERIC(6,1) NOT NULL DEFAULT 20
    CHECK (included_one_way_miles >= 0),
  mileage_only_cutoff_miles       NUMERIC(6,1) NOT NULL DEFAULT 20
    CHECK (mileage_only_cutoff_miles >= 0),
  travel_time_cutoff_miles        NUMERIC(6,1) NOT NULL DEFAULT 35
    CHECK (travel_time_cutoff_miles >= 0),
  long_distance_review_miles      NUMERIC(6,1) NOT NULL DEFAULT 60
    CHECK (long_distance_review_miles >= 0),
  minimum_project_value_low_cents INTEGER NOT NULL DEFAULT 75000
    CHECK (minimum_project_value_low_cents >= 0),
  minimum_project_value_high_cents INTEGER NOT NULL DEFAULT 100000
    CHECK (minimum_project_value_high_cents >= 0),
  default_mileage_rate_cents      INTEGER NOT NULL DEFAULT 70
    CHECK (default_mileage_rate_cents >= 0),
  default_travel_time_rate_cents  INTEGER NOT NULL DEFAULT 8500
    CHECK (default_travel_time_rate_cents >= 0),
  travel_time_rate_mode           TEXT NOT NULL DEFAULT 'standard_labor'
    CHECK (travel_time_rate_mode IN ('standard_labor', 'custom', 'none')),
  travel_time_rounding            TEXT NOT NULL DEFAULT 'nearest_15'
    CHECK (travel_time_rounding IN ('exact', 'nearest_15', 'nearest_30')),
  default_trip_calculation_method TEXT NOT NULL DEFAULT 'once_for_project'
    CHECK (default_trip_calculation_method IN (
      'once_for_project', 'once_per_visit', 'once_per_workday', 'custom'
    )),
  default_trip_direction          TEXT NOT NULL DEFAULT 'round_trip'
    CHECK (default_trip_direction IN ('round_trip', 'one_way')),
  customer_facing_line_title      TEXT NOT NULL DEFAULT 'Travel and Service-Area Adjustment',
  customer_facing_description     TEXT NOT NULL DEFAULT
    'Includes mileage and travel time associated with service outside the standard Dovetails Services local service area.',
  show_formulas_to_customer       BOOLEAN NOT NULL DEFAULT false,
  high_travel_ratio_threshold     NUMERIC(4,3) NOT NULL DEFAULT 0.250
    CHECK (high_travel_ratio_threshold >= 0 AND high_travel_ratio_threshold <= 1),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_business_travel_settings_updated_at
  BEFORE UPDATE ON business_travel_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE business_travel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_travel_settings FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_travel_settings' AND policyname = 'business_travel_settings_select'
  ) THEN
    CREATE POLICY business_travel_settings_select ON business_travel_settings
      FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_travel_settings' AND policyname = 'business_travel_settings_insert'
  ) THEN
    CREATE POLICY business_travel_settings_insert ON business_travel_settings
      FOR INSERT WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'business_travel_settings' AND policyname = 'business_travel_settings_update'
  ) THEN
    CREATE POLICY business_travel_settings_update ON business_travel_settings
      FOR UPDATE
      USING (account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

-- Seed defaults for existing accounts
INSERT INTO business_travel_settings (account_id)
SELECT id FROM accounts
ON CONFLICT (account_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- mileage_rates — historical rates; active rate used for new calculations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mileage_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  rate_cents      INTEGER NOT NULL CHECK (rate_cents >= 0),
  effective_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  source          TEXT NOT NULL DEFAULT 'custom'
    CHECK (source IN ('irs', 'custom', 'business')),
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mileage_rates_account_active
  ON mileage_rates (account_id, is_active, effective_date DESC);

CREATE TRIGGER trg_mileage_rates_updated_at
  BEFORE UPDATE ON mileage_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE mileage_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE mileage_rates FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mileage_rates' AND policyname = 'mileage_rates_select'
  ) THEN
    CREATE POLICY mileage_rates_select ON mileage_rates
      FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mileage_rates' AND policyname = 'mileage_rates_insert'
  ) THEN
    CREATE POLICY mileage_rates_insert ON mileage_rates
      FOR INSERT WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mileage_rates' AND policyname = 'mileage_rates_update'
  ) THEN
    CREATE POLICY mileage_rates_update ON mileage_rates
      FOR UPDATE
      USING (account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

-- Seed an active rate from settings default for each account
INSERT INTO mileage_rates (account_id, rate_cents, effective_date, source, description, is_active)
SELECT a.id, COALESCE(s.default_mileage_rate_cents, 70), CURRENT_DATE, 'business',
       'Initial business mileage rate', true
FROM accounts a
LEFT JOIN business_travel_settings s ON s.account_id = a.id
WHERE NOT EXISTS (
  SELECT 1 FROM mileage_rates mr WHERE mr.account_id = a.id
);

-- ---------------------------------------------------------------------------
-- travel_calculation_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS travel_calculation_snapshots (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  origin_address              TEXT NOT NULL,
  destination_address         TEXT NOT NULL,
  one_way_miles               NUMERIC(8,1) NOT NULL DEFAULT 0,
  round_trip_miles            NUMERIC(8,1) NOT NULL DEFAULT 0,
  one_way_minutes             INTEGER NOT NULL DEFAULT 0,
  round_trip_minutes          INTEGER NOT NULL DEFAULT 0,
  total_miles                 NUMERIC(8,1) NOT NULL DEFAULT 0,
  total_minutes               INTEGER NOT NULL DEFAULT 0,
  included_miles              NUMERIC(8,1) NOT NULL DEFAULT 0,
  billable_miles              NUMERIC(8,1) NOT NULL DEFAULT 0,
  mileage_rate_cents          INTEGER NOT NULL DEFAULT 0,
  mileage_charge_cents        INTEGER NOT NULL DEFAULT 0,
  billable_travel_minutes     INTEGER NOT NULL DEFAULT 0,
  travel_time_rate_cents      INTEGER NOT NULL DEFAULT 0,
  travel_time_charge_cents    INTEGER NOT NULL DEFAULT 0,
  recommended_total_cents     INTEGER NOT NULL DEFAULT 0,
  total_travel_charge_cents   INTEGER NOT NULL DEFAULT 0,
  trip_count                  INTEGER NOT NULL DEFAULT 1 CHECK (trip_count >= 1),
  trip_direction              TEXT NOT NULL DEFAULT 'round_trip'
    CHECK (trip_direction IN ('round_trip', 'one_way')),
  trip_calculation_method     TEXT NOT NULL DEFAULT 'once_for_project'
    CHECK (trip_calculation_method IN (
      'once_for_project', 'once_per_visit', 'once_per_workday', 'custom'
    )),
  policy_tier                 TEXT NOT NULL DEFAULT 'local'
    CHECK (policy_tier IN ('local', 'extended', 'distant', 'long_distance')),
  charge_mode                 TEXT NOT NULL DEFAULT 'separate_line'
    CHECK (charge_mode IN ('include_in_labor', 'separate_line', 'waive', 'custom')),
  calculation_source          TEXT NOT NULL DEFAULT 'manual'
    CHECK (calculation_source IN (
      'map_provider', 'haversine_estimate', 'manual', 'mileage_log', 'carried_forward'
    )),
  calculated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  manually_overridden         BOOLEAN NOT NULL DEFAULT false,
  override_reason             TEXT,
  client_rule                 TEXT,
  relationship_type           TEXT,
  owner_review_required       BOOLEAN NOT NULL DEFAULT false,
  owner_review_approved       BOOLEAN NOT NULL DEFAULT false,
  warnings_json               JSONB NOT NULL DEFAULT '[]'::jsonb,
  mileage_rate_id             UUID REFERENCES mileage_rates(id) ON DELETE SET NULL,
  -- parent entity (exactly one should be set for primary attachment; visits may also link)
  estimate_id                 UUID REFERENCES estimates(id) ON DELETE CASCADE,
  invoice_id                  UUID REFERENCES invoices(id) ON DELETE CASCADE,
  work_order_id               UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  visit_id                    UUID REFERENCES visits(id) ON DELETE CASCADE,
  job_id                      UUID REFERENCES jobs(id) ON DELETE SET NULL,
  -- estimated vs actual pairing
  kind                        TEXT NOT NULL DEFAULT 'estimate'
    CHECK (kind IN ('estimate', 'actual', 'invoice')),
  parent_snapshot_id          UUID REFERENCES travel_calculation_snapshots(id) ON DELETE SET NULL,
  created_by                  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_travel_snapshots_account
  ON travel_calculation_snapshots (account_id);
CREATE INDEX IF NOT EXISTS idx_travel_snapshots_estimate
  ON travel_calculation_snapshots (estimate_id) WHERE estimate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_snapshots_invoice
  ON travel_calculation_snapshots (invoice_id) WHERE invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_snapshots_work_order
  ON travel_calculation_snapshots (work_order_id) WHERE work_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_travel_snapshots_visit
  ON travel_calculation_snapshots (visit_id) WHERE visit_id IS NOT NULL;

CREATE TRIGGER trg_travel_calculation_snapshots_updated_at
  BEFORE UPDATE ON travel_calculation_snapshots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE travel_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_calculation_snapshots FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'travel_calculation_snapshots' AND policyname = 'travel_snapshots_select'
  ) THEN
    CREATE POLICY travel_snapshots_select ON travel_calculation_snapshots
      FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'travel_calculation_snapshots' AND policyname = 'travel_snapshots_insert'
  ) THEN
    CREATE POLICY travel_snapshots_insert ON travel_calculation_snapshots
      FOR INSERT WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'travel_calculation_snapshots' AND policyname = 'travel_snapshots_update'
  ) THEN
    CREATE POLICY travel_snapshots_update ON travel_calculation_snapshots
      FOR UPDATE
      USING (account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'travel_calculation_snapshots' AND policyname = 'travel_snapshots_delete'
  ) THEN
    CREATE POLICY travel_snapshots_delete ON travel_calculation_snapshots
      FOR DELETE USING (account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Pointer columns on parent entities (latest approved/active snapshot)
-- ---------------------------------------------------------------------------
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS travel_snapshot_id UUID
    REFERENCES travel_calculation_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS travel_charge_mode TEXT
    CHECK (travel_charge_mode IS NULL OR travel_charge_mode IN (
      'include_in_labor', 'separate_line', 'waive', 'custom'
    ));

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS travel_snapshot_id UUID
    REFERENCES travel_calculation_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS travel_billing_mode TEXT
    CHECK (travel_billing_mode IS NULL OR travel_billing_mode IN (
      'estimated', 'actual', 'none', 'custom'
    ));

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS travel_snapshot_id UUID
    REFERENCES travel_calculation_snapshots(id) ON DELETE SET NULL;

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS travel_snapshot_id UUID
    REFERENCES travel_calculation_snapshots(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Client relationship + travel rules
-- ---------------------------------------------------------------------------
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS relationship_type TEXT NOT NULL DEFAULT 'standard'
    CHECK (relationship_type IN ('standard', 'realtor', 'preferred', 'referral_partner')),
  ADD COLUMN IF NOT EXISTS travel_rule TEXT NOT NULL DEFAULT 'standard_policy'
    CHECK (travel_rule IN (
      'standard_policy', 'mileage_waived', 'travel_time_waived', 'all_travel_waived',
      'custom_included_radius', 'custom_mileage_rate', 'custom_travel_time_rate',
      'minimum_project_value_exemption', 'manual_review_required'
    )),
  ADD COLUMN IF NOT EXISTS custom_included_one_way_miles NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS custom_mileage_rate_cents INTEGER
    CHECK (custom_mileage_rate_cents IS NULL OR custom_mileage_rate_cents >= 0),
  ADD COLUMN IF NOT EXISTS custom_travel_time_rate_cents INTEGER
    CHECK (custom_travel_time_rate_cents IS NULL OR custom_travel_time_rate_cents >= 0),
  ADD COLUMN IF NOT EXISTS minimum_project_value_exempt BOOLEAN NOT NULL DEFAULT false;

COMMENT ON TABLE business_travel_settings IS
  'Per-account travel policy: origin, included radius, cutoffs, rates, customer-facing copy.';
COMMENT ON TABLE mileage_rates IS
  'Mileage rate history. Active rate is snapshotted onto each calculation; historical estimates keep their rate.';
COMMENT ON TABLE travel_calculation_snapshots IS
  'Immutable-ish calculation snapshot for estimate/invoice/work-order/visit travel charges.';
COMMENT ON COLUMN clients.relationship_type IS
  'Customer classification. Does NOT auto-waive travel — travel_rule controls charges.';
COMMENT ON COLUMN clients.travel_rule IS
  'Optional customer-level travel rule. standard_policy uses account defaults.';

-- Rollback:
-- ALTER TABLE visits DROP COLUMN IF EXISTS travel_snapshot_id;
-- ALTER TABLE work_orders DROP COLUMN IF EXISTS travel_snapshot_id;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS travel_snapshot_id, DROP COLUMN IF EXISTS travel_billing_mode;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS travel_snapshot_id, DROP COLUMN IF EXISTS travel_charge_mode;
-- ALTER TABLE clients DROP COLUMN IF EXISTS relationship_type, DROP COLUMN IF EXISTS travel_rule,
--   DROP COLUMN IF EXISTS custom_included_one_way_miles, DROP COLUMN IF EXISTS custom_mileage_rate_cents,
--   DROP COLUMN IF EXISTS custom_travel_time_rate_cents, DROP COLUMN IF EXISTS minimum_project_value_exempt;
-- DROP TABLE IF EXISTS travel_calculation_snapshots;
-- DROP TABLE IF EXISTS mileage_rates;
-- DROP TABLE IF EXISTS business_travel_settings;
