-- TASK-134: persist done vs coming-back on a completed visit.
-- Nullable additive. Existing rows stay NULL (legacy Complete).

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS closeout_kind TEXT
    CHECK (closeout_kind IS NULL OR closeout_kind IN ('done', 'return'));

COMMENT ON COLUMN visits.closeout_kind IS
  'Field closeout fork: done = job finished this visit; return = coming back. NULL = legacy complete.';

CREATE INDEX IF NOT EXISTS idx_visits_closeout_kind
  ON visits (account_id, closeout_kind)
  WHERE closeout_kind IS NOT NULL;

-- Reversal:
-- DROP INDEX IF EXISTS idx_visits_closeout_kind;
-- ALTER TABLE visits DROP COLUMN IF EXISTS closeout_kind;
