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

-- Reconcile pre-existing duplicate OPEN sessions per vehicle. The old day-based
-- model never prevented a vehicle from being left open across multiple days, so
-- a vehicle can already have >1 open session — which would break the per-vehicle
-- unique index below.
--
-- We CLOSE (not delete) the superseded duplicates so their attached
-- vehicle_session_activities (job/visit/estimate links, which cascade on delete)
-- are preserved. A superseded open never had an end odometer recorded, so we
-- close it at its own start (zero recorded movement) and note why. The newest
-- open session per vehicle stays open.
--
-- Closing at end = start needs the odometer checks to allow a zero-length
-- session; relax them from strict `>` to `>=`. The API still enforces strict
-- `>` for user-created sessions, so zero-mile rows only ever come from this
-- backfill.
ALTER TABLE vehicle_sessions
  DROP CONSTRAINT IF EXISTS vehicle_sessions_value_check,
  DROP CONSTRAINT IF EXISTS vehicle_sessions_odometer_order;

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
      AND end_odometer >= start_odometer
    )
    OR (
      miles IS NOT NULL
      AND miles >= 0
      AND (start_odometer IS NULL OR end_odometer IS NULL)
    )
  ),
  ADD CONSTRAINT vehicle_sessions_odometer_order CHECK (
    end_odometer IS NULL
    OR start_odometer IS NULL
    OR end_odometer >= start_odometer
  );

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY account_id, vehicle_id
           ORDER BY started_at DESC NULLS LAST, created_at DESC
         ) AS rn
  FROM vehicle_sessions
  WHERE end_odometer IS NULL AND miles IS NULL AND vehicle_id IS NOT NULL
)
UPDATE vehicle_sessions s
   SET end_odometer = s.start_odometer,
       miles = 0,
       ended_at = COALESCE(s.ended_at, now()),
       correction_reason = COALESCE(
         s.correction_reason,
         'Auto-closed by migration 113: superseded duplicate open session'
       ),
       updated_at = now()
  FROM ranked
 WHERE ranked.id = s.id
   AND ranked.rn > 1;

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
-- -- Re-tightening the odometer checks to strict `>` first requires removing any
-- -- zero-mile sessions this migration created (end_odometer = start_odometer).
-- ALTER TABLE vehicle_sessions ALTER COLUMN started_at DROP NOT NULL;
-- ALTER TABLE vehicle_sessions ALTER COLUMN started_at DROP DEFAULT;
-- ALTER TABLE vehicle_sessions
--   DROP COLUMN IF EXISTS started_at,
--   DROP COLUMN IF EXISTS ended_at,
--   DROP COLUMN IF EXISTS correction_reason;
