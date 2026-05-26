-- Migration 082: Mileage logs — odometer-based sessions
-- Adds vehicle, odometer readings, trip type, and additional entity links.
-- Miles becomes computed from odometers when both are present; existing manual
-- entries are preserved by keeping the miles column nullable.

-- Link to vehicle
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL;

-- Odometer readings (integer miles — no decimal needed for odometer)
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS start_odometer INTEGER CHECK (start_odometer >= 0);
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS end_odometer   INTEGER CHECK (end_odometer >= 0);

-- Trip type — replaces free-text purpose as structured classification
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS trip_type TEXT
  CHECK (trip_type IN ('job', 'estimate', 'walkthrough', 'material_pickup', 'personal', 'mixed'));

-- Additional entity links (job_id already exists)
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS visit_id    UUID REFERENCES visits(id)    ON DELETE SET NULL;
ALTER TABLE mileage_logs ADD COLUMN IF NOT EXISTS estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL;

-- Make miles nullable so odometer-based sessions can compute it in the API
-- (existing rows keep their values; new rows with odometers have miles set by API)
ALTER TABLE mileage_logs ALTER COLUMN miles DROP NOT NULL;

-- Drop the old > 0 check and replace with a constraint that allows either
-- a positive miles value OR a valid odometer pair
ALTER TABLE mileage_logs DROP CONSTRAINT IF EXISTS mileage_logs_miles_check;
ALTER TABLE mileage_logs ADD CONSTRAINT mileage_logs_value_check CHECK (
  (miles IS NOT NULL AND miles > 0)
  OR (start_odometer IS NOT NULL AND end_odometer IS NOT NULL AND end_odometer > start_odometer)
);

-- Constraint: if one odometer is set, both must be set
ALTER TABLE mileage_logs ADD CONSTRAINT mileage_logs_odometer_pair CHECK (
  (start_odometer IS NULL) = (end_odometer IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_mileage_logs_vehicle ON mileage_logs (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mileage_logs_visit    ON mileage_logs (visit_id)   WHERE visit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mileage_logs_estimate ON mileage_logs (estimate_id) WHERE estimate_id IS NOT NULL;

-- Reversal:
-- ALTER TABLE mileage_logs DROP COLUMN vehicle_id, DROP COLUMN start_odometer,
--   DROP COLUMN end_odometer, DROP COLUMN trip_type, DROP COLUMN visit_id, DROP COLUMN estimate_id;
-- ALTER TABLE mileage_logs ALTER COLUMN miles SET NOT NULL;
-- ALTER TABLE mileage_logs ADD CONSTRAINT mileage_logs_miles_check CHECK (miles > 0);
