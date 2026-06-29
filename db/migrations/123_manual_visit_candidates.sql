-- Migration 123: allow manually-created visit candidates (EPIC-007, TASK-045).
--
-- "I'm at customer site" lets the owner record a visit when GPS missed or the
-- address is new. Such a candidate has no originating stop, so
-- location_segment_id must be nullable. The UNIQUE(location_segment_id)
-- constraint is unaffected (NULLs are distinct in Postgres).

ALTER TABLE visit_candidates ALTER COLUMN location_segment_id DROP NOT NULL;

-- Reversal (only safe if no manual rows exist):
-- ALTER TABLE visit_candidates ALTER COLUMN location_segment_id SET NOT NULL;
