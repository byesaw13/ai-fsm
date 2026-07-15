-- Expand booking_requests.routing_path with book_work (owner: book work appointment).
-- Existing: site_visit | remote_estimate | pending

ALTER TABLE booking_requests
  DROP CONSTRAINT IF EXISTS booking_requests_routing_path_check;

ALTER TABLE booking_requests
  ADD CONSTRAINT booking_requests_routing_path_check
  CHECK (routing_path = ANY (ARRAY[
    'site_visit'::text,
    'remote_estimate'::text,
    'book_work'::text,
    'pending'::text
  ]));

COMMENT ON COLUMN booking_requests.routing_path IS
  'Owner/system path: site_visit (assessment), book_work (work day), remote_estimate, pending';
