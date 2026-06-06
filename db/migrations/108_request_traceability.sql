-- Migration 108: Request traceability — link booking_request_id to estimates and jobs.
-- Enables querying the full intake-to-invoice chain: BookingRequest → Estimate → Job.
-- Nullable on both sides: not every estimate or job originates from an intake request.

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS booking_request_id uuid REFERENCES booking_requests(id);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS booking_request_id uuid REFERENCES booking_requests(id);

CREATE INDEX IF NOT EXISTS idx_estimates_booking_request_id ON estimates(booking_request_id)
  WHERE booking_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_booking_request_id ON jobs(booking_request_id)
  WHERE booking_request_id IS NOT NULL;

COMMENT ON COLUMN estimates.booking_request_id IS 'Source intake request that spawned this estimate, if any.';
COMMENT ON COLUMN jobs.booking_request_id IS 'Source intake request that originated this job, if any.';
