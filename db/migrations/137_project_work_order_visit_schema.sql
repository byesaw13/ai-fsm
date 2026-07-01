-- Migration 137: Project → Work Order → Visit schema (Slice 1).
--
-- - work_orders: expanded planning statuses, job required when non-draft, planning fields
-- - visits: work_order_id for standard/punch_list, expanded execution statuses
-- - visit_type rules enforced at DB level
-- - backfill: default work orders per project, link execution visits

-- ---------------------------------------------------------------------------
-- 1. work_orders — new columns
-- ---------------------------------------------------------------------------

ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS preferred_technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS required_trade TEXT,
  ADD COLUMN IF NOT EXISTS completion_criteria JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS source_estimate_id UUID REFERENCES estimates(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. visits — work_order_id (nullable until backfill)
-- ---------------------------------------------------------------------------

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS work_order_id UUID REFERENCES work_orders(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_visits_work_order ON visits (work_order_id)
  WHERE work_order_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. work_orders status CHECK (expand before data backfill uses new values)
-- ---------------------------------------------------------------------------

ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_status_check
  CHECK (status IN (
    'draft', 'ready', 'scheduled', 'dispatched', 'waiting',
    'completed', 'cancelled', 'approved', 'closed',
    'in_progress'
  ));

-- ---------------------------------------------------------------------------
-- 4. Status vocabulary migration (work_orders)
-- ---------------------------------------------------------------------------

UPDATE work_orders
SET status = 'dispatched'
WHERE status = 'in_progress';

-- Attach orphan operational work orders via source visit → project
UPDATE work_orders wo
SET job_id = v.job_id,
    property_id = COALESCE(wo.property_id, j.property_id)
FROM visits v
JOIN jobs j ON j.id = v.job_id
WHERE wo.job_id IS NULL
  AND wo.status <> 'draft'
  AND wo.source_visit_id = v.id;

-- Unlinkable non-draft rows fall back to draft (planning only)
UPDATE work_orders
SET status = 'draft'
WHERE job_id IS NULL
  AND status NOT IN ('draft', 'cancelled');

-- Scheduled work orders with no linked or sibling execution visits → ready
UPDATE work_orders wo
SET status = 'ready'
WHERE wo.status = 'scheduled'
  AND NOT EXISTS (
    SELECT 1
    FROM visits v
    WHERE v.job_id = wo.job_id
      AND v.visit_type IN ('standard', 'punch_list')
  );

-- ---------------------------------------------------------------------------
-- 5. Default work orders for projects with unlinked execution visits
-- ---------------------------------------------------------------------------

INSERT INTO work_orders (
  account_id,
  client_id,
  job_id,
  property_id,
  title,
  scope,
  status,
  created_by
)
SELECT
  j.account_id,
  j.client_id,
  j.id,
  j.property_id,
  'Default — ' || j.title,
  j.description,
  'ready',
  j.created_by
FROM jobs j
WHERE EXISTS (
  SELECT 1
  FROM visits v
  WHERE v.job_id = j.id
    AND v.visit_type IN ('standard', 'punch_list')
    AND v.work_order_id IS NULL
)
AND NOT EXISTS (
  SELECT 1
  FROM work_orders wo
  WHERE wo.job_id = j.id
    AND wo.status <> 'cancelled'
);

-- Link execution visits to the primary work order on their project
UPDATE visits v
SET work_order_id = sub.wo_id
FROM (
  SELECT DISTINCT ON (v2.id)
    v2.id AS visit_id,
    wo.id AS wo_id
  FROM visits v2
  JOIN work_orders wo ON wo.job_id = v2.job_id AND wo.status <> 'cancelled'
  WHERE v2.visit_type IN ('standard', 'punch_list')
    AND v2.work_order_id IS NULL
  ORDER BY v2.id, wo.created_at ASC
) sub
WHERE v.id = sub.visit_id;

-- Promote work orders that now have future visits
UPDATE work_orders wo
SET status = 'scheduled'
WHERE wo.status IN ('ready', 'draft')
  AND wo.job_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM visits v
    WHERE v.work_order_id = wo.id
      AND v.status = 'scheduled'
      AND v.scheduled_start > now()
  );

-- Active field visits → dispatched planning milestone
UPDATE work_orders wo
SET status = 'dispatched'
WHERE wo.status IN ('ready', 'scheduled')
  AND EXISTS (
    SELECT 1
    FROM visits v
    WHERE v.work_order_id = wo.id
      AND v.status IN ('arrived', 'in_progress')
  );

-- ---------------------------------------------------------------------------
-- 6. work_orders job required when non-draft
-- ---------------------------------------------------------------------------

ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_job_required_non_draft;

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_job_required_non_draft
  CHECK (status = 'draft' OR job_id IS NOT NULL);

-- Drop legacy in_progress from allowed statuses after vocabulary migration
ALTER TABLE work_orders DROP CONSTRAINT IF EXISTS work_orders_status_check;

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_status_check
  CHECK (status IN (
    'draft', 'ready', 'scheduled', 'dispatched', 'waiting',
    'completed', 'cancelled', 'approved', 'closed'
  ));

-- ---------------------------------------------------------------------------
-- 7. visits status CHECK (expanded execution statuses)
-- ---------------------------------------------------------------------------

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_status_check;

ALTER TABLE visits
  ADD CONSTRAINT visits_status_check
  CHECK (status IN (
    'scheduled', 'dispatched', 'traveling', 'arrived',
    'in_progress', 'waiting', 'completed', 'cancelled'
  ));

-- ---------------------------------------------------------------------------
-- 8. visit_type — add sales_walkthrough
-- ---------------------------------------------------------------------------

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_visit_type_check;

ALTER TABLE visits
  ADD CONSTRAINT visits_visit_type_check
  CHECK (visit_type IN (
    'standard',
    'site_visit',
    'realtor_baseline',
    'membership_health_check',
    'punch_list',
    'sales_walkthrough'
  ));

-- ---------------------------------------------------------------------------
-- 9. visit_type ↔ work_order_id mutual exclusion
-- ---------------------------------------------------------------------------

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_work_order_type_check;

ALTER TABLE visits
  ADD CONSTRAINT visits_work_order_type_check
  CHECK (
    (
      visit_type IN ('standard', 'punch_list')
      AND work_order_id IS NOT NULL
    )
    OR (
      visit_type NOT IN ('standard', 'punch_list')
      AND work_order_id IS NULL
    )
  );

-- ---------------------------------------------------------------------------
-- 10. visits.work_order_id must match work_orders.job_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_visit_work_order_consistency()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  wo_job_id UUID;
  wo_status TEXT;
BEGIN
  IF NEW.work_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT job_id, status
  INTO wo_job_id, wo_status
  FROM work_orders
  WHERE id = NEW.work_order_id;

  IF wo_job_id IS NULL THEN
    RAISE EXCEPTION 'work_order % not found', NEW.work_order_id
      USING ERRCODE = 'P0001';
  END IF;

  IF wo_status = 'draft' THEN
    RAISE EXCEPTION 'draft work orders cannot have visits'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.job_id IS DISTINCT FROM wo_job_id THEN
    RAISE EXCEPTION 'visit job_id must match work_order job_id (visit %, work_order %)',
      NEW.job_id, wo_job_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visits_work_order_consistency ON visits;

CREATE TRIGGER trg_visits_work_order_consistency
  BEFORE INSERT OR UPDATE OF work_order_id, job_id ON visits
  FOR EACH ROW
  EXECUTE FUNCTION validate_visit_work_order_consistency();

-- ---------------------------------------------------------------------------
-- 11. Visit transition guard — execution layer statuses
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_visit_transition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  allowed text[];
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('arrived', 'in_progress', 'dispatched', 'traveling')
     AND NEW.assigned_user_id IS NULL THEN
    RAISE EXCEPTION
      'visit cannot transition to % without an assigned user', NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  allowed := CASE OLD.status
    WHEN 'scheduled'   THEN ARRAY['dispatched', 'arrived', 'cancelled']
    WHEN 'dispatched'  THEN ARRAY['traveling', 'arrived', 'cancelled']
    WHEN 'traveling'   THEN ARRAY['arrived', 'cancelled']
    WHEN 'arrived'     THEN ARRAY['in_progress', 'waiting', 'cancelled']
    WHEN 'in_progress' THEN ARRAY['waiting', 'completed', 'cancelled']
    WHEN 'waiting'     THEN ARRAY['in_progress', 'cancelled']
    WHEN 'completed'   THEN ARRAY[]::text[]
    WHEN 'cancelled'   THEN ARRAY[]::text[]
    ELSE                    ARRAY[]::text[]
  END;

  IF NOT (NEW.status = ANY(allowed)) THEN
    RAISE EXCEPTION
      'invalid visit transition: % → % (allowed: %)',
      OLD.status, NEW.status, array_to_string(allowed, ', ')
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'arrived' AND OLD.status <> 'arrived' THEN
    NEW.arrived_at := now();
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Reversal notes:
-- DROP TRIGGER trg_visits_work_order_consistency ON visits;
-- DROP FUNCTION validate_visit_work_order_consistency();
-- ALTER TABLE visits DROP CONSTRAINT visits_work_order_type_check;
-- ALTER TABLE visits DROP COLUMN work_order_id;
-- (restore prior status checks manually if rolling back)