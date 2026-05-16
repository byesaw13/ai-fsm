-- Expand automations type constraint to include property_issue_scan
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

-- Seed one property_issue_scan automation per existing account (idempotent)
INSERT INTO automations (account_id, type, enabled, config, next_run_at)
SELECT a.id, 'property_issue_scan', true,
       '{"min_occurrences": 2, "lookback_months": 18}'::jsonb,
       now()
  FROM accounts a
 WHERE NOT EXISTS (
   SELECT 1 FROM automations existing
    WHERE existing.account_id = a.id
      AND existing.type = 'property_issue_scan'
 );
