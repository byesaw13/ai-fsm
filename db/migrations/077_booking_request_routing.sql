-- Add routing decision fields to booking_requests.
-- routing_path: computed at submission time from the walkthrough decision engine.
--   "site_visit"      — scope complexity suggests an in-person assessment first
--   "remote_estimate" — straightforward enough to estimate without a walkthrough
--   "pending"         — decision not yet computed (legacy rows)
-- walkthrough_score: 0-100 site-visit probability score (>= 50 = site visit recommended)

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS routing_path     TEXT NOT NULL DEFAULT 'pending'
    CHECK (routing_path IN ('site_visit', 'remote_estimate', 'pending')),
  ADD COLUMN IF NOT EXISTS walkthrough_score SMALLINT CHECK (walkthrough_score BETWEEN 0 AND 100);
