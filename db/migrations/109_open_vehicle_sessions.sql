-- Migration 109: Open vehicle sessions for the Daily Operating Loop
-- Allows a day to start with a start odometer and close later with end odometer.

ALTER TABLE vehicle_sessions
  DROP CONSTRAINT IF EXISTS vehicle_sessions_value_check,
  DROP CONSTRAINT IF EXISTS vehicle_sessions_odometer_pair;

ALTER TABLE vehicle_sessions
  ADD CONSTRAINT vehicle_sessions_value_check CHECK (
    (
      end_odometer IS NULL
      AND miles IS NULL
      AND start_odometer IS NOT NULL
    )
    OR (
      end_odometer IS NOT NULL
      AND start_odometer IS NOT NULL
      AND end_odometer > start_odometer
    )
    OR (
      miles IS NOT NULL
      AND miles > 0
      AND (start_odometer IS NULL OR end_odometer IS NULL)
    )
  ),
  ADD CONSTRAINT vehicle_sessions_odometer_order CHECK (
    end_odometer IS NULL
    OR start_odometer IS NULL
    OR end_odometer > start_odometer
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_sessions_one_open_per_day
  ON vehicle_sessions (account_id, session_date)
  WHERE end_odometer IS NULL AND miles IS NULL;

-- Reversal:
-- DROP INDEX IF EXISTS idx_vehicle_sessions_one_open_per_day;
-- ALTER TABLE vehicle_sessions
--   DROP CONSTRAINT IF EXISTS vehicle_sessions_value_check,
--   DROP CONSTRAINT IF EXISTS vehicle_sessions_odometer_order;
-- ALTER TABLE vehicle_sessions
--   ADD CONSTRAINT vehicle_sessions_value_check CHECK (
--     (miles IS NOT NULL AND miles > 0)
--     OR (start_odometer IS NOT NULL AND end_odometer IS NOT NULL AND end_odometer > start_odometer)
--   ),
--   ADD CONSTRAINT vehicle_sessions_odometer_pair CHECK (
--     (start_odometer IS NULL) = (end_odometer IS NULL)
--   );
