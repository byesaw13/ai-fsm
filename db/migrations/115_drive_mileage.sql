-- Migration 115: drive → mileage (TASK-025 slice 1).
--
-- Lets a captured drive segment (TASK-024) become a mileage session: the owner
-- picks the vehicle and confirms the GPS-estimated miles. Additive columns only.
--
--   location_segments.distance_meters     — straight-line GPS estimate, set when
--                                           a drive closes (refined later).
--   location_segments.vehicle_id          — vehicle the drive is attributed to
--                                           (auto from Bluetooth in slice 2; null
--                                           until the owner picks one).
--   location_segments.vehicle_session_id  — the mileage session created on log.
--   vehicles.bluetooth_id                 — car-stereo BT identity → vehicle map
--                                           (used by the slice-2 BT auto-attribution).
--   vehicles.is_default                   — the vehicle pre-selected when logging
--                                           a trip with no other signal (the RAM).

ALTER TABLE location_segments
  ADD COLUMN IF NOT EXISTS distance_meters    DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vehicle_id         UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vehicle_session_id UUID REFERENCES vehicle_sessions(id) ON DELETE SET NULL;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS bluetooth_id TEXT,
  ADD COLUMN IF NOT EXISTS is_default   BOOLEAN NOT NULL DEFAULT false;

-- At most one default vehicle per account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_one_default
  ON vehicles (account_id) WHERE is_default = true;

-- Reversal:
-- DROP INDEX IF EXISTS idx_vehicles_one_default;
-- ALTER TABLE vehicles DROP COLUMN IF EXISTS is_default, DROP COLUMN IF EXISTS bluetooth_id;
-- ALTER TABLE location_segments
--   DROP COLUMN IF EXISTS vehicle_session_id,
--   DROP COLUMN IF EXISTS vehicle_id,
--   DROP COLUMN IF EXISTS distance_meters;
