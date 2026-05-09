CREATE TABLE status_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL,
  entity_type   text NOT NULL CHECK (entity_type IN ('job','visit','estimate','invoice','booking_request')),
  entity_id     uuid NOT NULL,
  from_status   text,
  to_status     text NOT NULL,
  changed_by    uuid REFERENCES users(id),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX status_history_entity ON status_history(entity_type, entity_id);
CREATE INDEX status_history_account ON status_history(account_id, created_at DESC);

ALTER TABLE status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY status_history_account_isolation ON status_history
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
