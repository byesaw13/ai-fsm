CREATE TABLE completion_packets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL,
  visit_id         uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  photo_urls       text[] NOT NULL DEFAULT '{}',
  signature_url    text,
  signature_waiver boolean NOT NULL DEFAULT false,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES users(id)
);

CREATE UNIQUE INDEX completion_packets_visit ON completion_packets(visit_id);

ALTER TABLE completion_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY completion_packets_account ON completion_packets
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
