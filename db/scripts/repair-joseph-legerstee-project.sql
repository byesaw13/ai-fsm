-- ============================================================================
-- Repair Joseph Legerstee project (false closeout + premature final invoice)
-- ============================================================================
-- Problem:
--   Completing one work-day visit auto-completed the project and work order,
--   and auto-created a full final draft invoice (INV-0025) while multi-day
--   T&M work is still ongoing. Paid deposit INV-0023 is correctly linked.
--
-- Product rule (after code fix):
--   Visits / work orders never complete the project. Owner must explicitly
--   complete the project for billing review.
--
-- This script re-opens the project for continued work and voids the premature
-- final draft. Deposit remains paid and linked.
--
-- Operator:
--   1) Review Step 1 SELECTs
--   2) Uncomment BEGIN/COMMIT after preview looks right
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/scripts/repair-joseph-legerstee-project.sql
-- ============================================================================

-- IDs (main Dovetails account)
-- client:   7c1b677c-f6c1-4ddd-9a92-52d8ea13a8e2
-- job:      8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2
-- estimate: 71ebc3fe-be3d-4f8a-b8cd-2d947d139bcb
-- wo:       7faecc1b-0032-405d-9632-3dcf007399b9
-- deposit:  INV-0023 (keep paid)
-- final:    INV-0025 (void draft)

-- ----------------------------------------------------------------------------
-- Step 1: Preview
-- ----------------------------------------------------------------------------
SELECT j.id, j.title, j.status AS job_status, j.updated_at
FROM jobs j
WHERE j.id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2';

SELECT wo.id, wo.title, wo.status, wo.completed_at, wo.completion_criteria
FROM work_orders wo
WHERE wo.id = '7faecc1b-0032-405d-9632-3dcf007399b9';

SELECT i.id, i.invoice_number, i.invoice_kind, i.status, i.total_cents, i.paid_cents, i.job_id, i.estimate_id
FROM invoices i
WHERE i.client_id = '7c1b677c-f6c1-4ddd-9a92-52d8ea13a8e2'
ORDER BY i.created_at;

SELECT v.id, v.visit_type, v.status, v.work_order_id, v.scheduled_start, v.completed_at
FROM visits v
WHERE v.job_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
ORDER BY v.scheduled_start;

-- ----------------------------------------------------------------------------
-- Step 2: Repair
-- ----------------------------------------------------------------------------
-- NOTE: jobs has validate_job_transition trigger — completed → in_progress is
-- not a normal app path. Disable that trigger only for this operator repair.
--
-- BEGIN;

-- Re-open project for multi-day work (bypass status machine for repair only)
ALTER TABLE jobs DISABLE TRIGGER trg_jobs_transition;

UPDATE jobs
SET status = 'in_progress',
    updated_at = now()
WHERE id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
  AND status IN ('completed', 'invoiced');

ALTER TABLE jobs ENABLE TRIGGER trg_jobs_transition;

-- Re-open work order; normalize criteria shape (legacy done/description → canonical)
UPDATE work_orders
SET status = 'ready',
    completed_at = NULL,
    completion_criteria = (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', COALESCE(elem->>'id', 'li-' || ord::text),
          'label', COALESCE(elem->>'label', elem->>'description', ''),
          'required', COALESCE((elem->>'required')::boolean, true),
          'completed', COALESCE((elem->>'completed')::boolean, (elem->>'done')::boolean, false)
        )
        ORDER BY ord
      ), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(completion_criteria, '[]'::jsonb))
        WITH ORDINALITY AS t(elem, ord)
    ),
    updated_at = now()
WHERE id = '7faecc1b-0032-405d-9632-3dcf007399b9';

-- Void premature full final draft (do not send). Keep deposit INV-0023.
-- May need to disable invoice transition trigger if void from draft is blocked.
UPDATE invoices
SET status = 'void',
    updated_at = now()
WHERE id = '799af778-5d31-4f8b-b542-6cd29b77dc3c'
  AND invoice_number = 'INV-0025'
  AND invoice_kind = 'final'
  AND status = 'draft'
  AND paid_cents = 0;

-- Optional: re-bind 7/14 client-only activity to the project
UPDATE activity_entries
SET entity_type = 'job',
    entity_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
WHERE id = '35f4c4f6-2e27-4a0e-82f1-8c904f5d96f2'
  AND entity_type = 'client'
  AND entity_id = '7c1b677c-f6c1-4ddd-9a92-52d8ea13a8e2';

-- Leave 7/13 standard visit completed (historical work day is fine).

-- COMMIT;
-- ROLLBACK;
