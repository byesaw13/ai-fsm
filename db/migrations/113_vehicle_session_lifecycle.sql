-- Migration 113: Vehicle session lifecycle (session-based mileage, not day-based)
--
-- Makes vehicle_sessions the source of truth for odometer movement and lets a
-- single Daily Operations Log carry MULTIPLE vehicle mileage sessions.
--
-- Adds session lifecycle timestamps and a correction reason, and replaces the
-- day-level "one open session per day" lock (migration 109) with a per-vehicle
-- lock so the owner can switch vehicles mid-day without ending the day.

-- 1) Lifecycle columns -------------------------------------------------------
ALTER TABLE vehicle_sessions ADD COLUMN IF NOT EXISTS started_at         TIMESTAMPTZ;
ALTER TABLE vehicle_sessions ADD COLUMN IF NOT EXISTS ended_at           TIMESTAMPTZ;
ALTER TABLE vehicle_sessions ADD COLUMN IF NOT EXISTS correction_reason  TEXT;

-- Backfill started_at from created_at; closed sessions get ended_at from updated_at.
UPDATE vehicle_sessions SET started_at = created_at WHERE started_at IS NULL;
UPDATE vehicle_sessions
   SET ended_at = updated_at
 WHERE ended_at IS NULL AND end_odometer IS NOT NULL;

-- started_at is required going forward; default now() for new rows.
ALTER TABLE vehicle_sessions ALTER COLUMN started_at SET DEFAULT now();
ALTER TABLE vehicle_sessions ALTER COLUMN started_at SET NOT NULL;

-- 2) Open-session locking ----------------------------------------------------
-- Drop the day-level lock that forced one vehicle per day.
DROP INDEX IF EXISTS idx_vehicle_sessions_one_open_per_day;

-- Allow at most one OPEN (no end odometer, no miles) session per vehicle.
-- NULL vehicle_id rows are exempt (SQL treats NULLs as distinct), which is an
-- acceptable edge for unassigned sessions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_sessions_one_open_per_vehicle
  ON vehicle_sessions (account_id, vehicle_id)
  WHERE end_odometer IS NULL AND miles IS NULL AND vehicle_id IS NOT NULL;

-- Reversal:
-- DROP INDEX IF EXISTS idx_vehicle_sessions_one_open_per_vehicle;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_sessions_one_open_per_day
--   ON vehicle_sessions (account_id, session_date)
--   WHERE end_odometer IS NULL AND miles IS NULL;
-- ALTER TABLE vehicle_sessions ALTER COLUMN started_at DROP NOT NULL;
-- ALTER TABLE vehicle_sessions ALTER COLUMN started_at DROP DEFAULT;
-- ALTER TABLE vehicle_sessions
--   DROP COLUMN IF EXISTS started_at,
--   DROP COLUMN IF EXISTS ended_at,
--   DROP COLUMN IF EXISTS correction_reason;
