-- Migration 187: learned home fence for location privacy (TASK-148).
--
-- HA zone name "home" is not always present; reverse-geocode of the shop/house
-- is a street address (8 Bus Rd) and used to surface as job work. Persist the
-- first home-zone fix so anything inside that fence stays private.

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS home_latitude      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_longitude     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_radius_meters INTEGER NOT NULL DEFAULT 100;

-- Rollback:
-- ALTER TABLE accounts
--   DROP COLUMN IF EXISTS home_radius_meters,
--   DROP COLUMN IF EXISTS home_longitude,
--   DROP COLUMN IF EXISTS home_latitude;
