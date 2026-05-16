ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_type_check;

ALTER TABLE automations ADD CONSTRAINT automations_type_check
  CHECK (type IN (
    'visit_reminder',
    'invoice_followup',
    'booking_confirmed',
    'review_request',
    'estimate_followup',
    'membership_renewal_nudge',
    'stale_job_nudge',
    'property_issue_scan',
    'client_reactivation',
    'seasonal_reminder_spring',
    'seasonal_reminder_fall',
    'recurring_inspection'
  ));

INSERT INTO automations (account_id, type, enabled, config, next_run_at)
SELECT a.id, t.type, true, t.config, now()
  FROM accounts a
 CROSS JOIN (VALUES
   ('client_reactivation',      '{"inactive_days": 180, "suppress_days": 365}'::jsonb),
   ('seasonal_reminder_spring', '{"month": 3}'::jsonb),
   ('seasonal_reminder_fall',   '{"month": 10}'::jsonb),
   ('recurring_inspection',     '{"lead_days": 14}'::jsonb)
 ) AS t(type, config)
 WHERE NOT EXISTS (
   SELECT 1 FROM automations existing
    WHERE existing.account_id = a.id AND existing.type = t.type
 );
