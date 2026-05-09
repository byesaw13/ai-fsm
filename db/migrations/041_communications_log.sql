CREATE TABLE communications_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         uuid NOT NULL,
  client_id          uuid REFERENCES clients(id),
  booking_request_id uuid REFERENCES booking_requests(id),
  job_id             uuid REFERENCES jobs(id),
  visit_id           uuid REFERENCES visits(id),
  channel            text NOT NULL CHECK (channel IN ('sms','email','phone')),
  direction          text NOT NULL CHECK (direction IN ('outbound','inbound')),
  outcome            text NOT NULL CHECK (outcome IN ('sent','delivered','failed','no_answer','left_voicemail','replied')),
  body_preview       text,
  initiated_by       uuid REFERENCES users(id),
  external_id        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comms_log_client ON communications_log(client_id, created_at DESC);
CREATE INDEX comms_log_account ON communications_log(account_id, created_at DESC);

ALTER TABLE communications_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY comms_log_account ON communications_log
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
