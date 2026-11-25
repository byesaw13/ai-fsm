-- Migration 222: stop the property issue scan (TASK-258).
-- Property issue tracking is removed (owner, 2026-11-25). Its daily automation
-- scanned an empty table; the worker no longer has a handler for it. The
-- property_issues / property_condition_snapshots / period_closes /
-- intake_invites tables stay in place (empty), for a later task to drop.
DELETE FROM automations WHERE type = 'property_issue_scan';

-- Reversal: the row is re-created by the account automation seeding if the
-- feature ever returns; no data is lost (it held no state beyond its schedule).
