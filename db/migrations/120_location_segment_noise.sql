-- Migration 120: false-drive detection (TASK-040).
--
-- Captured drives include "false" ones — parked Bluetooth connect/disconnect
-- cycles, GPS drift, and sub-minute teleport blips — that clutter the labeling
-- backlog. Add a classification flag and back-fill the existing provisional
-- drives. The thresholds here MIRROR `classifyDrive` in
-- packages/domain/src/location.ts (NOISE < 1 km/h, SUSPECT < 3 km/h, drives
-- under 60s are noise); keep them in sync.
--
--   is_likely_noise — true for auto-dismissed noise and flagged borderline drives.

ALTER TABLE location_segments
  ADD COLUMN IF NOT EXISTS is_likely_noise BOOLEAN NOT NULL DEFAULT false;

-- One-time backfill over existing provisional drives only (never touch a
-- confirmed/dismissed segment, never touch stops). Idempotent: re-running just
-- re-applies the same classification.
--
-- noise   = duration < 60s, OR avg speed < 1 km/h
-- suspect = 1 km/h <= avg speed < 3 km/h
-- avg km/h = distance_meters * 3.6 / duration_seconds

-- Flag noise + suspect drives.
UPDATE location_segments
SET is_likely_noise = true, updated_at = now()
WHERE kind = 'drive'
  AND status = 'provisional'
  AND ended_at IS NOT NULL
  AND (
    EXTRACT(EPOCH FROM (ended_at - started_at)) < 60
    OR (
      distance_meters IS NOT NULL
      AND EXTRACT(EPOCH FROM (ended_at - started_at)) >= 60
      AND distance_meters * 3.6 / EXTRACT(EPOCH FROM (ended_at - started_at)) < 3
    )
  );

-- Auto-dismiss the noise subset (< 60s or < 1 km/h).
UPDATE location_segments
SET status = 'dismissed', updated_at = now()
WHERE kind = 'drive'
  AND status = 'provisional'
  AND ended_at IS NOT NULL
  AND (
    EXTRACT(EPOCH FROM (ended_at - started_at)) < 60
    OR (
      distance_meters IS NOT NULL
      AND EXTRACT(EPOCH FROM (ended_at - started_at)) >= 60
      AND distance_meters * 3.6 / EXTRACT(EPOCH FROM (ended_at - started_at)) < 1
    )
  );

-- Reversal:
-- ALTER TABLE location_segments DROP COLUMN IF EXISTS is_likely_noise;
-- (the auto-dismissed rows keep status='dismissed'; re-open by hand if needed.)
