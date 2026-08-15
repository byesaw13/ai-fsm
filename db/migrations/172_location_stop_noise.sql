-- Migration 172: false-stop detection (TASK-106).
--
-- HA Companion still / zone flicker opens a stop on every transition. Drives
-- already go through classifyDrive (migration 120); stops were never
-- classified, so 0–4 minute blips piled up as provisional review items.
-- Thresholds here MIRROR `classifyStop` in packages/domain/src/location.ts
-- (noise < 5 minutes, unless a scheduled visit is attached).
--
--   is_likely_noise — already exists (migration 120).
--   status          — auto-dismiss the noise subset.

-- Flag + dismiss closed provisional stops under the 5-minute floor that are
-- not tied to a scheduled visit today. Never touch confirmed/dismissed rows
-- or still-open stops. Idempotent.

UPDATE location_segments ls
SET is_likely_noise = true,
    status = 'dismissed',
    updated_at = now()
WHERE ls.kind = 'stop'
  AND ls.status = 'provisional'
  AND ls.ended_at IS NOT NULL
  AND EXTRACT(EPOCH FROM (ls.ended_at - ls.started_at)) < 300
  AND NOT EXISTS (
    SELECT 1
    FROM visit_candidates vc
    WHERE vc.location_segment_id = ls.id
      AND vc.visit_id IS NOT NULL
  );

-- Reversal:
-- UPDATE location_segments SET status = 'provisional', is_likely_noise = false
--  WHERE kind = 'stop' AND status = 'dismissed' AND is_likely_noise
--    AND EXTRACT(EPOCH FROM (ended_at - started_at)) < 300;
