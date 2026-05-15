-- Migration 051: First-class visit_type with realtor_baseline as supported type
-- Additive only — existing visits default to 'standard'.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'standard';

ALTER TABLE visits
  DROP CONSTRAINT IF EXISTS visits_visit_type_check;

ALTER TABLE visits
  ADD CONSTRAINT visits_visit_type_check
  CHECK (visit_type IN ('standard', 'realtor_baseline', 'membership_health_check', 'punch_list'));

CREATE INDEX IF NOT EXISTS idx_visits_visit_type
  ON visits (account_id, visit_type)
  WHERE visit_type <> 'standard';
