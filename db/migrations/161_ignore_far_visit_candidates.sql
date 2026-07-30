-- Migration 161: ignore historical far-false visit candidates
--
-- Before the distance hard-gate (MAX_MATCH_DISTANCE_METERS = 800), open-job
-- scoring could tag home overnight stops as customer visits (e.g. Brian Floss
-- from Derry ~50 km away) at 100% confidence. Clean pending noise so Day Review
-- is usable. Confirmed/ignored rows are left alone.

UPDATE visit_candidates
SET status = 'ignored',
    classification = COALESCE(classification, 'ignore'),
    updated_at = now()
WHERE status = 'pending'
  AND distance_meters IS NOT NULL
  AND distance_meters > 800;

-- Reversal: not fully reversible (which rows were user-ignored vs auto) — leave as-is.
