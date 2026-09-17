-- TASK-145: night stop interview. Reason + notes live on the GPS stop so
-- store runs (no visit_candidate) and customer stops share one answer.

ALTER TABLE location_segments
  ADD COLUMN IF NOT EXISTS stop_reason TEXT;

ALTER TABLE location_segments
  ADD COLUMN IF NOT EXISTS stop_notes TEXT;

ALTER TABLE location_segments
  DROP CONSTRAINT IF EXISTS location_segments_stop_reason_check;

ALTER TABLE location_segments
  ADD CONSTRAINT location_segments_stop_reason_check
  CHECK (
    stop_reason IS NULL
    OR stop_reason IN ('job_work', 'new_work', 'pickup', 'store', 'not_work')
  );

COMMENT ON COLUMN location_segments.stop_reason IS
  'Night interview: why this stop happened. Null = unanswered.';
COMMENT ON COLUMN location_segments.stop_notes IS
  'What you did / picked up. Required for job_work and new_work.';

-- Down:
-- ALTER TABLE location_segments DROP CONSTRAINT IF EXISTS location_segments_stop_reason_check;
-- ALTER TABLE location_segments DROP COLUMN IF EXISTS stop_notes;
-- ALTER TABLE location_segments DROP COLUMN IF EXISTS stop_reason;
