-- Migration 098: Seed follow-up automation records
-- Adds lead_followup and 7-day estimate_followup automations for all existing accounts.
-- These drive the worker's follow-up logic without code changes per account.

-- Lead follow-up: surface action item for pending booking requests idle > 24h
INSERT INTO automations (account_id, type, config, enabled, next_run_at)
SELECT
  a.id AS account_id,
  'lead_followup' AS type,
  '{"hours_threshold": 24}'::jsonb AS config,
  true AS enabled,
  now() AS next_run_at
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM automations au
  WHERE au.account_id = a.id AND au.type = 'lead_followup'
);

-- 7-day estimate follow-up: second nudge for non-responded estimates
-- (3-day follow-up already seeded when the estimate_followup automation was created)
INSERT INTO automations (account_id, type, config, enabled, next_run_at)
SELECT
  a.id AS account_id,
  'estimate_followup' AS type,
  '{"days_after_sent": 7}'::jsonb AS config,
  true AS enabled,
  now() AS next_run_at
FROM accounts a
WHERE NOT EXISTS (
  SELECT 1 FROM automations au
  WHERE au.account_id = a.id
    AND au.type = 'estimate_followup'
    AND (au.config->>'days_after_sent')::int = 7
);
