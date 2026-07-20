-- Migration 153: Booking request sales funnel
-- Called (pending) → assessment_booked → estimated → converted
-- Lost = estimate declined / customer no-go / 60-day idle
-- cancelled remains for spam / not-a-lead admin closes

ALTER TABLE booking_requests DROP CONSTRAINT IF EXISTS booking_requests_status_check;
ALTER TABLE booking_requests ADD CONSTRAINT booking_requests_status_check
  CHECK (status IN (
    'pending',
    'needs_info',
    'duplicate',
    'reviewed',
    'assessment_booked',
    'estimated',
    'converted',
    'lost',
    'cancelled'
  ));

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS closed_reason TEXT
    CHECK (closed_reason IS NULL OR closed_reason IN (
      'estimate_declined',
      'customer_declined',
      'stale',
      'other',
      'spam'
    )),
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Worker: find open requests idle past 60 days
CREATE INDEX IF NOT EXISTS booking_requests_open_updated_at_idx
  ON booking_requests (updated_at)
  WHERE status IN ('pending', 'needs_info', 'reviewed', 'assessment_booked', 'estimated');

-- One-shot backfill from existing linkages (idempotent heuristics)
-- Approved estimate linked → converted
UPDATE booking_requests br
SET status = 'converted',
    updated_at = now()
WHERE br.status NOT IN ('converted', 'cancelled', 'lost', 'duplicate')
  AND EXISTS (
    SELECT 1 FROM estimates e
    WHERE e.booking_request_id = br.id
      AND e.account_id = br.account_id
      AND e.status = 'approved'
  );

-- Any non-declined estimate linked → estimated (if not already converted+)
UPDATE booking_requests br
SET status = 'estimated',
    updated_at = now()
WHERE br.status IN ('pending', 'needs_info', 'reviewed', 'assessment_booked')
  AND EXISTS (
    SELECT 1 FROM estimates e
    WHERE e.booking_request_id = br.id
      AND e.account_id = br.account_id
      AND e.status IN ('draft', 'sent', 'expired')
  );

-- Visit linked, no estimate stage yet → assessment_booked
UPDATE booking_requests br
SET status = 'assessment_booked',
    updated_at = now()
WHERE br.status IN ('pending', 'needs_info', 'reviewed')
  AND br.visit_id IS NOT NULL;
