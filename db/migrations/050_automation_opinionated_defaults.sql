-- Migration 050: Seed opinionated automation defaults for every existing account
-- Idempotent: only inserts a (account_id, type) row if it doesn't exist.
-- Each automation runs every 4 hours by default, enabled out of the box.

INSERT INTO automations (account_id, type, enabled, config, next_run_at)
SELECT a.id, t.type, true, t.config, now()
  FROM accounts a
 CROSS JOIN (
   VALUES
     ('visit_reminder',           '{"hours_before": 24}'::jsonb),
     ('invoice_followup',         '{"days_after_due": 7}'::jsonb),
     ('booking_confirmed',        '{}'::jsonb),
     ('review_request',           '{"days_after_completion": 3}'::jsonb),
     ('estimate_followup',        '{"days_after_sent": 3}'::jsonb),
     ('membership_renewal_nudge', '{"days_before_renewal": 30}'::jsonb),
     ('stale_job_nudge',          '{"days_without_visit": 14}'::jsonb)
   ) AS t(type, config)
 WHERE NOT EXISTS (
   SELECT 1 FROM automations existing
    WHERE existing.account_id = a.id
      AND existing.type = t.type
 );
