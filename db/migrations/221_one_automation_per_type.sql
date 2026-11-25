-- Migration 221: one automation per type per account (TASK-256).
--
-- * membership_renewal_nudge: no worker handler exists (memberships are
--   paused); the row has not run since 2026-06-07.
-- * The second estimate_followup row (days_after_sent = 7, seeded by 098):
--   owner 2026-11-25 wants only the 3-day reminder. It never sent anyway —
--   both rows share the idempotency key estimate_followup:<estimate id>.
-- Then the database keeps it that way.
DELETE FROM automations WHERE type = 'membership_renewal_nudge';
DELETE FROM automations
 WHERE type = 'estimate_followup' AND (config->>'days_after_sent')::int = 7
   AND EXISTS (SELECT 1 FROM automations o
                WHERE o.account_id = automations.account_id
                  AND o.type = 'estimate_followup' AND o.id <> automations.id);

CREATE UNIQUE INDEX IF NOT EXISTS automations_one_per_type
  ON automations (account_id, type);

-- ── Reversal ────────────────────────────────────────────────────────────────
--   DROP INDEX IF EXISTS automations_one_per_type;
--   INSERT INTO automations (account_id, type, config, enabled, next_run_at)
--   SELECT id, 'membership_renewal_nudge', '{"days_before_renewal": 30}'::jsonb, true, now() FROM accounts;
--   INSERT INTO automations (account_id, type, config, enabled, next_run_at)
--   SELECT id, 'estimate_followup', '{"days_after_sent": 7}'::jsonb, true, now() FROM accounts;
