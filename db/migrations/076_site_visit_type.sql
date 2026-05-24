-- Add site_visit to the visit_type check constraint
-- Site visits are used when converting an intake to assess and measure
-- the project scope before creating an estimate.

ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_visit_type_check;
ALTER TABLE visits ADD CONSTRAINT visits_visit_type_check
  CHECK (visit_type IN ('standard', 'site_visit', 'realtor_baseline', 'membership_health_check', 'punch_list'));
