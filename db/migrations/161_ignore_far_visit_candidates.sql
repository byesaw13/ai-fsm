-- Migration 161: ignore historical far-false visit candidates (reversible)
--
-- Before the distance hard-gate (MAX_MATCH_DISTANCE_METERS = 800), open-job
-- scoring could tag home overnight stops as customer visits (e.g. Brian Floss
-- from Derry ~50 km away) at 100% confidence. Clean pending noise so Day Review
-- is usable. Confirmed rows are left alone.

CREATE TABLE IF NOT EXISTS _migration_161_ignored_candidates (
  id UUID PRIMARY KEY,
  previous_status TEXT NOT NULL,
  previous_classification TEXT,
  distance_meters DOUBLE PRECISION,
  ignored_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO _migration_161_ignored_candidates (id, previous_status, previous_classification, distance_meters)
SELECT vc.id, vc.status, vc.classification, vc.distance_meters
FROM visit_candidates vc
WHERE vc.status = 'pending'
  AND vc.distance_meters IS NOT NULL
  AND vc.distance_meters > 800
ON CONFLICT (id) DO NOTHING;

UPDATE visit_candidates vc
SET status = 'ignored',
    classification = COALESCE(vc.classification, 'ignore'),
    updated_at = now()
FROM _migration_161_ignored_candidates b
WHERE vc.id = b.id
  AND vc.status = 'pending';

-- Reversal:
-- UPDATE visit_candidates vc
-- SET status = b.previous_status,
--     classification = b.previous_classification,
--     updated_at = now()
-- FROM _migration_161_ignored_candidates b
-- WHERE vc.id = b.id;
-- DROP TABLE IF EXISTS _migration_161_ignored_candidates;
