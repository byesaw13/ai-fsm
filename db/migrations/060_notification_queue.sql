CREATE TABLE notification_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id        UUID        REFERENCES clients(id) ON DELETE CASCADE,
  automation_type  TEXT        NOT NULL,
  priority         INT         NOT NULL DEFAULT 50,
  channel          TEXT        NOT NULL DEFAULT 'email'
                               CHECK (channel IN ('email')),
  to_address       TEXT        NOT NULL,
  subject          TEXT        NOT NULL,
  html_body        TEXT        NOT NULL,
  idempotency_key  TEXT        NOT NULL UNIQUE,
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','sent','failed','cancelled','skipped')),
  attempt_count    INT         NOT NULL DEFAULT 0,
  max_attempts     INT         NOT NULL DEFAULT 5,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  failed_at        TIMESTAMPTZ,
  failure_reason   TEXT,
  entity_type      TEXT,
  entity_id        UUID,
  cancel_on_events TEXT[]      NOT NULL DEFAULT '{}',
  metadata         JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nq_pending
  ON notification_queue (priority, next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_nq_entity_pending
  ON notification_queue (entity_type, entity_id)
  WHERE entity_id IS NOT NULL AND status = 'pending';

CREATE INDEX idx_nq_client_day
  ON notification_queue (account_id, client_id, sent_at)
  WHERE status = 'sent' AND sent_at IS NOT NULL;
