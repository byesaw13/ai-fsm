ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS duplicate_candidate_ids uuid[] DEFAULT '{}';
