-- Scope assumptions: customer-visible conditions each estimate relies on.
-- Auto-populated from scope_templates.default_assumptions when a service type is selected.
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS scope_assumptions TEXT;

ALTER TABLE scope_templates ADD COLUMN IF NOT EXISTS default_assumptions TEXT;

UPDATE scope_templates SET default_assumptions =
  'Assumes shutoff valves are functional and accessible. Assumes no active corrosion on supply line connections. Assumes existing supply lines are reusable. If seized valves, corroded fittings, or non-standard connections are found on arrival, additional scope and cost will require customer approval before work can proceed.'
WHERE category = 'plumbing';

UPDATE scope_templates SET default_assumptions =
  'Assumes all circuit breakers and outlets are accessible. Assumes standard copper wiring (14 or 12 AWG). Assumes a neutral wire is present at the switch/outlet location. Aluminum wiring, knob-and-tube, or missing neutral found on arrival will require additional scope discussion.'
WHERE category = 'electrical';

UPDATE scope_templates SET default_assumptions =
  'Assumes surfaces are structurally sound with no hidden water damage or soft substrate. Assumes standard drywall construction. If hidden damage is discovered during work, scope will be reassessed before proceeding.'
WHERE category = 'general_repairs';

UPDATE scope_templates SET default_assumptions =
  'Assumes standard drywall substrate with studs at 16-inch centers. Assumes no wire concealment or special blocking is needed. Heavy items (>75 lbs) or masonry substrate require additional scope discussion.'
WHERE category = 'mounting_installs';
