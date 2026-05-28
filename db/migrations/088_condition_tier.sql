-- Condition risk tier on estimates: green (standard), yellow (elevated), red (complex/flagged).
-- Auto-computed from existing risk flags. RED reserved for manual assignment or future
-- auto-detection when an approved change order exists (on-site conditions found).
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS condition_tier TEXT
    CHECK (condition_tier IN ('green', 'yellow', 'red'));

-- Backfill from existing risk flags.
-- Wrap in an explicit transaction so that if the UPDATE or re-enable fails,
-- the DISABLE TRIGGER is rolled back and the trigger is never left disabled.
BEGIN;

ALTER TABLE estimates DISABLE TRIGGER trg_estimates_immutability;

UPDATE estimates
SET condition_tier = CASE
  WHEN old_house_risk = true
    OR difficult_access = true
    OR trip_count = 'multi_trip'
    OR requires_drying_or_curing = true
    OR coordination_required = true
  THEN 'yellow'
  ELSE 'green'
END
WHERE condition_tier IS NULL;

ALTER TABLE estimates ENABLE TRIGGER trg_estimates_immutability;

COMMIT;
