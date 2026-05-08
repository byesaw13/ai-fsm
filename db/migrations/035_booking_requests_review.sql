-- Extend booking_requests for staff review workflow.
-- Adds two new status lanes (needs_info, duplicate) and a review_notes field.
-- The public intake endpoint stops auto-creating visits; visits are now
-- staff-triggered via the review flow.

-- Expand status CHECK constraint
ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_status_check;
ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN ('pending', 'needs_info', 'duplicate', 'reviewed', 'converted', 'cancelled'));

-- Review notes from staff
ALTER TABLE booking_requests ADD COLUMN IF NOT EXISTS review_notes TEXT;
