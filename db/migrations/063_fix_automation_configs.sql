-- Fix automation config key names to match worker expectations.
-- Migration 062 seeded incorrect keys: 'inactive_days' and 'lead_days'.
-- Worker reads 'days_inactive' and 'interval_days' respectively.

UPDATE automations
SET config = jsonb_build_object(
  'days_inactive', COALESCE((config->>'inactive_days')::int, 180),
  'suppress_days', COALESCE((config->>'suppress_days')::int, 365)
)
WHERE type = 'client_reactivation'
  AND config ? 'inactive_days';

UPDATE automations
SET config = jsonb_build_object(
  'interval_days', 365
)
WHERE type = 'recurring_inspection'
  AND config ? 'lead_days';
