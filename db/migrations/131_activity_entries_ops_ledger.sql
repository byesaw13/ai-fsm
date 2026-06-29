-- Migration 131: activity_entries gains the Operations Engine ledger links
-- (TASK-053, Phase 3 slice 1). Additive + reversible.
--
-- Activity = the verb (the existing activity_type). Assignment = the business
-- object the work attaches to (the existing entity_type/entity_id, plus a small
-- assignment_kind for non-entity assignments: office/shop/inventory/training).
-- labor_bucket (billable/overhead/personal/warranty) is the profitability axis,
-- derived from activity + assignment at write time. business_day_id and
-- time_clock_session_id link an entry to its day and (when clocked in) its
-- payroll session — references only; the activity stays independent.

ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS business_day_id       UUID REFERENCES business_days(id)       ON DELETE SET NULL;
ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS time_clock_session_id UUID REFERENCES time_clock_sessions(id) ON DELETE SET NULL;
ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS labor_bucket    TEXT CHECK (labor_bucket    IN ('billable','overhead','personal','warranty'));
ALTER TABLE activity_entries
  ADD COLUMN IF NOT EXISTS assignment_kind TEXT CHECK (assignment_kind IN ('office','shop','inventory','training','none'));

-- Backfill labor_bucket for existing rows from the activity verb (the DOCUMENTED
-- DEFAULT — the billable/overhead split is a business judgment the owner refines;
-- the mapping lives in packages/domain laborBucketFor).
UPDATE activity_entries SET labor_bucket =
  CASE
    WHEN activity_type = 'job_work' THEN 'billable'
    WHEN activity_type = 'personal' THEN 'personal'
    ELSE 'overhead'
  END
WHERE labor_bucket IS NULL;

CREATE INDEX IF NOT EXISTS idx_activity_entries_business_day ON activity_entries (business_day_id);
CREATE INDEX IF NOT EXISTS idx_activity_entries_clock        ON activity_entries (time_clock_session_id);

-- Default labor_bucket from the activity verb on INSERT when the caller doesn't
-- set it, so EVERY new entry carries the profitability axis (not just the
-- backfilled ones) regardless of which insert path created it. The app may still
-- set labor_bucket explicitly (e.g. warranty from the assignment) — the trigger
-- only fills NULL. Mirrors the domain laborBucketFor default.
CREATE OR REPLACE FUNCTION activity_entries_default_labor_bucket()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.labor_bucket IS NULL THEN
    NEW.labor_bucket := CASE
      WHEN NEW.activity_type = 'job_work' THEN 'billable'
      WHEN NEW.activity_type = 'personal' THEN 'personal'
      ELSE 'overhead'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_entries_labor_bucket ON activity_entries;
CREATE TRIGGER trg_activity_entries_labor_bucket
  BEFORE INSERT ON activity_entries
  FOR EACH ROW EXECUTE FUNCTION activity_entries_default_labor_bucket();
