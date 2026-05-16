-- Per-account cooldown tracking (updated every time an outbound message is sent)
CREATE TABLE notification_cooldowns (
  account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id    UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, client_id)
);

-- Per-account automation governance config
CREATE TABLE automation_rules (
  account_id               UUID    NOT NULL PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  cooldown_hours           INT     NOT NULL DEFAULT 4  CHECK (cooldown_hours >= 0),
  max_per_day              INT     NOT NULL DEFAULT 2  CHECK (max_per_day >= 1),
  working_hours_start      INT     NOT NULL DEFAULT 8  CHECK (working_hours_start BETWEEN 0 AND 23),
  working_hours_end        INT     NOT NULL DEFAULT 19 CHECK (working_hours_end BETWEEN 1 AND 24),
  working_hours_tz         TEXT    NOT NULL DEFAULT 'America/New_York',
  suppress_on_open_invoice BOOLEAN NOT NULL DEFAULT false
);

-- Seed rules for all existing accounts
INSERT INTO automation_rules (account_id)
SELECT id FROM accounts
ON CONFLICT (account_id) DO NOTHING;

ALTER TABLE notification_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_cooldowns_account ON notification_cooldowns
  USING (account_id = current_setting('app.current_account_id', true)::uuid);

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY automation_rules_account ON automation_rules
  USING (account_id = current_setting('app.current_account_id', true)::uuid);

ALTER TABLE notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_queue_account ON notification_queue
  USING (account_id = current_setting('app.current_account_id', true)::uuid);

ALTER TABLE workflow_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY workflow_events_account ON workflow_events
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
