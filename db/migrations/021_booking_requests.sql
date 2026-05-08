-- Migration 021: Online booking requests
-- Public booking page that captures intake requests for staff review.

CREATE TABLE IF NOT EXISTS booking_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES clients(id) ON DELETE SET NULL,  -- NULL if new client
  property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  visit_id        UUID REFERENCES visits(id) ON DELETE SET NULL,

  -- Client contact info
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,

  -- Service details
  service_category TEXT NOT NULL,                 -- matches price_book_category enum values
  service_description TEXT NOT NULL,              -- client's description of work needed
  preferred_date   DATE NOT NULL,
  preferred_time_slot TEXT,                       -- e.g. "morning", "afternoon", "evening"

  -- Property details
  address         TEXT NOT NULL,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  access_notes    TEXT,                            -- gate codes, parking instructions, etc.

  -- Processing status
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'reviewed', 'converted', 'cancelled')),
  reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS booking_requests_account_id_idx ON booking_requests(account_id);
CREATE INDEX IF NOT EXISTS booking_requests_status_idx ON booking_requests(status);
CREATE INDEX IF NOT EXISTS booking_requests_preferred_date_idx ON booking_requests(preferred_date);

-- Allow public access to the booking submission endpoint (no RLS needed for this, it's a direct API route)
