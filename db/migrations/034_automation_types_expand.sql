-- Migration 034: Expand automation type enum to include booking_confirmed and review_request
-- Reversible: yes (restore original constraint in down section)

-- Drop and replace the check constraint on automations.type
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_type_check;

ALTER TABLE automations ADD CONSTRAINT automations_type_check
  CHECK (type IN ('visit_reminder', 'invoice_followup', 'booking_confirmed', 'review_request'));

-- DOWN:
-- ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_type_check;
-- ALTER TABLE automations ADD CONSTRAINT automations_type_check
--   CHECK (type IN ('visit_reminder', 'invoice_followup'));
