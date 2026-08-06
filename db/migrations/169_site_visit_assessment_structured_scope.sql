-- Migration 169: structured assessment scope fields for TASK-018 residual.
-- Domain AssessmentSummary already consumes work_items / prep_notes / trade_notes /
-- customer_supplied_materials when present; this persists them on site assessments.

ALTER TABLE site_visit_assessments
  ADD COLUMN IF NOT EXISTS work_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS prep_notes TEXT,
  ADD COLUMN IF NOT EXISTS trade_notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_supplied_materials TEXT;

COMMENT ON COLUMN site_visit_assessments.work_items IS
  'JSON string array of work items captured on the assessment form (TASK-018).';
COMMENT ON COLUMN site_visit_assessments.prep_notes IS
  'Prep requirements (masking, furniture, surface prep, …).';
COMMENT ON COLUMN site_visit_assessments.trade_notes IS
  'JSON object of trade-keyed notes, e.g. {"painting":"…","drywall":"…"}.';
COMMENT ON COLUMN site_visit_assessments.customer_supplied_materials IS
  'Materials the customer is providing (excluded from purchase lists).';

-- Down (manual):
-- ALTER TABLE site_visit_assessments
--   DROP COLUMN IF EXISTS work_items,
--   DROP COLUMN IF EXISTS prep_notes,
--   DROP COLUMN IF EXISTS trade_notes,
--   DROP COLUMN IF EXISTS customer_supplied_materials;
