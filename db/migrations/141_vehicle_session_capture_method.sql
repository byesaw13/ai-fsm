-- Migration 141: mileage capture method + session status (TASK-050)
--
-- Every mileage number records how it was captured; GPS estimates can be voided
-- (never deleted) when an enclosing odometer close wins. Additive + reversible.

ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS miles_source TEXT;
ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

-- Backfill lifecycle status from existing completion signals.
UPDATE vehicle_sessions
   SET status = 'closed'
 WHERE status = 'open'
   AND (end_odometer IS NOT NULL OR miles IS NOT NULL);

-- Backfill capture method for completed rows.
UPDATE vehicle_sessions
   SET miles_source = 'odometer'
 WHERE miles_source IS NULL
   AND start_odometer IS NOT NULL
   AND end_odometer IS NOT NULL;

UPDATE vehicle_sessions
   SET miles_source = 'manual_miles'
 WHERE miles_source IS NULL
   AND miles IS NOT NULL;

ALTER TABLE vehicle_sessions
  DROP CONSTRAINT IF EXISTS vehicle_sessions_miles_source_check;
ALTER TABLE vehicle_sessions
  ADD CONSTRAINT vehicle_sessions_miles_source_check CHECK (
    miles_source IS NULL
    OR miles_source IN ('odometer', 'manual_miles', 'gps_estimate', 'bt_gps_estimate')
  );

ALTER TABLE vehicle_sessions
  DROP CONSTRAINT IF EXISTS vehicle_sessions_status_check;
ALTER TABLE vehicle_sessions
  ADD CONSTRAINT vehicle_sessions_status_check CHECK (
    status IN ('open', 'closed', 'voided')
  );

CREATE INDEX IF NOT EXISTS idx_vehicle_sessions_status
  ON vehicle_sessions (account_id, session_date, status);