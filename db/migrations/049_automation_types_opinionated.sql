-- Migration 049: Expand automation type enum for opinionated defaults
-- Adds: estimate_followup, membership_renewal_nudge, stale_job_nudge

ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_type_check;

ALTER TABLE automations ADD CONSTRAINT automations_type_check
  CHECK (type IN (
    'visit_reminder',
    'invoice_followup',
    'booking_confirmed',
    'review_request',
    'estimate_followup',
    'membership_renewal_nudge',
    'stale_job_nudge'
  ));

-- DOWN:
-- ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_type_check;
-- ALTER TABLE automations ADD CONSTRAINT automations_type_check
--   CHECK (type IN ('visit_reminder', 'invoice_followup', 'booking_confirmed', 'review_request'));
