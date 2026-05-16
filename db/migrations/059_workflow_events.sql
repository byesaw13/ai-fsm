CREATE TABLE workflow_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type   TEXT        NOT NULL,
  entity_type  TEXT        NOT NULL,
  entity_id    UUID        NOT NULL,
  payload      JSONB       NOT NULL DEFAULT '{}',
  processed    BOOLEAN     NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_events_unprocessed
  ON workflow_events (created_at)
  WHERE processed = false;

CREATE INDEX idx_workflow_events_entity
  ON workflow_events (entity_type, entity_id, event_type, created_at DESC);
