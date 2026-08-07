-- Migration 170: Vehicle & Trailer Cost-of-Ownership (TASK-093)
-- Money source of truth remains expenses (add vehicle_id). Capture tables hold
-- operational facts only (no cost columns); each capture auto-creates one expense
-- in app code (same transaction).

-- ── vehicles extensions ─────────────────────────────────────────────────────
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'truck',
  ADD COLUMN IF NOT EXISTS vin text,
  ADD COLUMN IF NOT EXISTS purchase_date date,
  ADD COLUMN IF NOT EXISTS purchase_price_cents integer;

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_kind_check;
ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_kind_check
  CHECK (kind IN ('truck', 'van', 'trailer', 'other'));

-- Composite FK target so child rows cannot point at another account's vehicle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vehicles_id_account_uniq'
  ) THEN
    ALTER TABLE vehicles
      ADD CONSTRAINT vehicles_id_account_uniq UNIQUE (id, account_id);
  END IF;
END $$;

-- ── expenses.vehicle_id + vehicle-specific categories ───────────────────────
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_expenses_vehicle_date
  ON expenses (vehicle_id, expense_date)
  WHERE vehicle_id IS NOT NULL;

-- Expand category check for vehicle tax categories (keep legacy values).
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
ALTER TABLE expenses ADD CONSTRAINT expenses_category_check CHECK (category IN (
  'materials','tools','fuel','vehicle',
  'subcontractors','office','insurance',
  'utilities','marketing','meals','travel','other',
  'vehicle_fuel','vehicle_maintenance','vehicle_registration',
  'vehicle_insurance','vehicle_loan_payment'
));

-- ── vehicle_fuel_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_fuel_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL,
  filled_at        timestamptz NOT NULL DEFAULT now(),
  odometer         integer CHECK (odometer IS NULL OR odometer >= 0),
  gallons          numeric(10,3) NOT NULL CHECK (gallons > 0),
  is_full_tank     boolean NOT NULL DEFAULT true,
  odometer_suspect boolean NOT NULL DEFAULT false,
  notes            text,
  expense_id       uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_fuel_logs_vehicle_account_fk
    FOREIGN KEY (vehicle_id, account_id) REFERENCES vehicles (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_logs_vehicle
  ON vehicle_fuel_logs (account_id, vehicle_id, filled_at DESC);

-- ── vehicle_service_records ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_service_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL,
  serviced_at      date NOT NULL DEFAULT (CURRENT_DATE),
  odometer         integer CHECK (odometer IS NULL OR odometer >= 0),
  odometer_suspect boolean NOT NULL DEFAULT false,
  service_types    text[] NOT NULL DEFAULT '{}',
  vendor_name      text,
  notes            text,
  expense_id       uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_service_records_vehicle_account_fk
    FOREIGN KEY (vehicle_id, account_id) REFERENCES vehicles (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_service_records_vehicle
  ON vehicle_service_records (account_id, vehicle_id, serviced_at DESC);

-- ── vehicle_service_schedules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_service_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id      uuid NOT NULL,
  service_type    text NOT NULL,
  interval_miles  integer CHECK (interval_miles IS NULL OR interval_miles > 0),
  interval_months integer CHECK (interval_months IS NULL OR interval_months > 0),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_service_schedules_vehicle_account_fk
    FOREIGN KEY (vehicle_id, account_id) REFERENCES vehicles (id, account_id),
  CONSTRAINT vehicle_service_schedules_interval_chk CHECK (
    interval_miles IS NOT NULL OR interval_months IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_service_schedules_uniq
  ON vehicle_service_schedules (account_id, vehicle_id, service_type)
  WHERE is_active = true;

-- ── vehicle_loans (reference only; payments are expenses) ───────────────────
CREATE TABLE IF NOT EXISTS vehicle_loans (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id               uuid NOT NULL,
  lender                   text NOT NULL,
  original_principal_cents integer NOT NULL CHECK (original_principal_cents >= 0),
  apr                      numeric(6,3),
  monthly_payment_cents    integer NOT NULL CHECK (monthly_payment_cents >= 0),
  start_date               date NOT NULL,
  term_months              integer CHECK (term_months IS NULL OR term_months > 0),
  current_balance_cents    integer CHECK (current_balance_cents IS NULL OR current_balance_cents >= 0),
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_loans_vehicle_account_fk
    FOREIGN KEY (vehicle_id, account_id) REFERENCES vehicles (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_loans_vehicle
  ON vehicle_loans (account_id, vehicle_id) WHERE is_active = true;

-- ── vehicle_renewals (schedule state) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_renewals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id       uuid NOT NULL,
  renewal_type     text NOT NULL CHECK (renewal_type IN (
                     'registration','insurance','inspection','emissions','other'
                   )),
  provider         text,
  interval_months  integer NOT NULL DEFAULT 12 CHECK (interval_months > 0),
  current_due_date date NOT NULL,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_renewals_vehicle_account_fk
    FOREIGN KEY (vehicle_id, account_id) REFERENCES vehicles (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_renewals_due
  ON vehicle_renewals (account_id, current_due_date)
  WHERE is_active = true;

-- ── vehicle_renewal_records (completion history) ────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_renewal_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id   uuid NOT NULL,
  renewal_type text NOT NULL,
  renewed_at   date NOT NULL DEFAULT (CURRENT_DATE),
  expense_id   uuid REFERENCES expenses(id) ON DELETE SET NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_renewal_records_vehicle_account_fk
    FOREIGN KEY (vehicle_id, account_id) REFERENCES vehicles (id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicle_renewal_records_vehicle
  ON vehicle_renewal_records (account_id, vehicle_id, renewed_at DESC);

-- ── cost summary view (money = expenses only) ───────────────────────────────
CREATE OR REPLACE VIEW vehicle_cost_summary AS
SELECT
  e.account_id,
  e.vehicle_id,
  date_trunc('month', e.expense_date)::date AS period_month,
  e.category,
  SUM(e.amount_cents)::bigint AS total_cents,
  COUNT(*)::int AS expense_count
FROM expenses e
WHERE e.vehicle_id IS NOT NULL
GROUP BY e.account_id, e.vehicle_id, date_trunc('month', e.expense_date), e.category;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE vehicle_fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_fuel_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_service_records FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_service_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_service_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_loans FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_renewals ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_renewals FORCE ROW LEVEL SECURITY;
ALTER TABLE vehicle_renewal_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_renewal_records FORCE ROW LEVEL SECURITY;

-- Capture tables: tech+ can write; all can read account-scoped
DO $$
BEGIN
  -- fuel
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_fuel_logs' AND policyname='vehicle_fuel_logs_select') THEN
    CREATE POLICY vehicle_fuel_logs_select ON vehicle_fuel_logs FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_fuel_logs' AND policyname='vehicle_fuel_logs_insert') THEN
    CREATE POLICY vehicle_fuel_logs_insert ON vehicle_fuel_logs FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_fuel_logs' AND policyname='vehicle_fuel_logs_update') THEN
    CREATE POLICY vehicle_fuel_logs_update ON vehicle_fuel_logs FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_fuel_logs' AND policyname='vehicle_fuel_logs_delete') THEN
    CREATE POLICY vehicle_fuel_logs_delete ON vehicle_fuel_logs FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;

  -- service records
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_service_records' AND policyname='vehicle_service_records_select') THEN
    CREATE POLICY vehicle_service_records_select ON vehicle_service_records FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_service_records' AND policyname='vehicle_service_records_insert') THEN
    CREATE POLICY vehicle_service_records_insert ON vehicle_service_records FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_service_records' AND policyname='vehicle_service_records_update') THEN
    CREATE POLICY vehicle_service_records_update ON vehicle_service_records FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_service_records' AND policyname='vehicle_service_records_delete') THEN
    CREATE POLICY vehicle_service_records_delete ON vehicle_service_records FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;

  -- schedules / loans / renewals: owner/admin write
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_service_schedules' AND policyname='vehicle_service_schedules_select') THEN
    CREATE POLICY vehicle_service_schedules_select ON vehicle_service_schedules FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_service_schedules' AND policyname='vehicle_service_schedules_write') THEN
    CREATE POLICY vehicle_service_schedules_write ON vehicle_service_schedules FOR ALL USING (
      account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_loans' AND policyname='vehicle_loans_select') THEN
    CREATE POLICY vehicle_loans_select ON vehicle_loans FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_loans' AND policyname='vehicle_loans_write') THEN
    CREATE POLICY vehicle_loans_write ON vehicle_loans FOR ALL USING (
      account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_renewals' AND policyname='vehicle_renewals_select') THEN
    CREATE POLICY vehicle_renewals_select ON vehicle_renewals FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_renewals' AND policyname='vehicle_renewals_write') THEN
    CREATE POLICY vehicle_renewals_write ON vehicle_renewals FOR ALL USING (
      account_id = app_account_id() AND is_owner_or_admin())
      WITH CHECK (account_id = app_account_id() AND is_owner_or_admin());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_renewal_records' AND policyname='vehicle_renewal_records_select') THEN
    CREATE POLICY vehicle_renewal_records_select ON vehicle_renewal_records FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_renewal_records' AND policyname='vehicle_renewal_records_insert') THEN
    CREATE POLICY vehicle_renewal_records_insert ON vehicle_renewal_records FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner','admin','tech'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vehicle_renewal_records' AND policyname='vehicle_renewal_records_delete') THEN
    CREATE POLICY vehicle_renewal_records_delete ON vehicle_renewal_records FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin());
  END IF;
END $$;

-- Techs may insert vehicle-category expenses only when tied to a vehicle
-- (capture endpoints auto-create expense in same txn as fuel/service).
DROP POLICY IF EXISTS expenses_insert ON expenses;
CREATE POLICY expenses_insert ON expenses FOR INSERT WITH CHECK (
  account_id = app_account_id()
  AND (
    is_owner_or_admin()
    OR (
      app_role() = 'tech'
      AND vehicle_id IS NOT NULL
      AND category IN (
        'vehicle_fuel','vehicle_maintenance','vehicle_registration',
        'vehicle_insurance','vehicle_loan_payment'
      )
    )
  )
);

-- Rollback sketch:
-- DROP VIEW IF EXISTS vehicle_cost_summary;
-- DROP TABLE IF EXISTS vehicle_renewal_records, vehicle_renewals, vehicle_loans,
--   vehicle_service_schedules, vehicle_service_records, vehicle_fuel_logs;
-- ALTER TABLE expenses DROP COLUMN IF EXISTS vehicle_id;
-- ALTER TABLE vehicles DROP COLUMN IF EXISTS kind, vin, purchase_date, purchase_price_cents;
