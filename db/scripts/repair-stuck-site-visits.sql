-- ============================================================================
-- Repair stuck pre-sale site visits (Peter Marinelli pattern)
-- ============================================================================
-- Problem: Assessment was marked complete (site_visit_assessments.completed_at
-- set) but the parent site_visit never auto-closed (status still scheduled,
-- arrived, in_progress, etc.).
-- Jobs then show the wrong pipeline stage ("Working" instead of estimate
-- needed) and stale "do the site visit" prompts in the UI.
--
-- Peter Marinelli pattern: assessment complete, visit still in_progress.
-- Joseph Legerstee pattern: assessment complete, visit still scheduled
-- (cascade was not deployed when assessment was saved).
--
-- Prerequisite: workflow close-out cascade code must be deployed so new
-- assessment completions auto-close visits. This script is a one-time repair
-- for existing stuck rows.
--
-- Operator runs manually — review Step 1 before uncommenting BEGIN/COMMIT:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/scripts/repair-stuck-site-visits.sql
--
-- Recommended: add AND visits.account_id = '<main-account-uuid>' to both queries
-- before running in production. After repair, create/send estimates for affected
-- jobs if still missing.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Step 1: Preview — rows that will be repaired
-- ----------------------------------------------------------------------------
SELECT
  v.id              AS visit_id,
  v.account_id,
  v.job_id,
  v.status          AS visit_status,
  v.completed_at    AS visit_completed_at,
  sva.completed_at  AS assessment_completed_at,
  j.title           AS job_title
FROM visits v
JOIN site_visit_assessments sva ON sva.visit_id = v.id
LEFT JOIN jobs j ON j.id = v.job_id
WHERE v.visit_type = 'site_visit'
  AND v.status NOT IN ('completed', 'cancelled')
  AND sva.completed_at IS NOT NULL
ORDER BY v.account_id, sva.completed_at;

-- ----------------------------------------------------------------------------
-- Step 2: Repair — complete visits whose assessments are already done
-- ----------------------------------------------------------------------------
-- Uncomment BEGIN/COMMIT after reviewing Step 1 output.

-- BEGIN;

UPDATE visits
SET
  status = 'completed',
  completed_at = COALESCE(visits.completed_at, sva.completed_at)
FROM site_visit_assessments sva
WHERE visits.id = sva.visit_id
  AND visits.visit_type = 'site_visit'
  AND visits.status NOT IN ('completed', 'cancelled')
  AND sva.completed_at IS NOT NULL;
  -- Optional: AND visits.account_id = '<your-main-account-uuid>';

-- COMMIT;
-- ROLLBACK;  -- use instead of COMMIT if preview looks wrong