-- Migration 084: Action items — operational inbox
-- Each row is a prompted next step for a specific entity (booking request,
-- estimate, job, invoice). Resolved_at NULL = open. The inbox shows all open items.

CREATE TABLE IF NOT EXISTS action_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type  TEXT        NOT NULL CHECK (entity_type IN ('booking_request', 'estimate', 'job', 'invoice')),
  entity_id    UUID        NOT NULL,
  action_type  TEXT        NOT NULL,
  title        TEXT        NOT NULL,
  due_at       TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate open items for the same entity + action type
CREATE UNIQUE INDEX IF NOT EXISTS action_items_open_unique
  ON action_items (account_id, entity_id, action_type)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_account_open
  ON action_items (account_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_action_items_entity
  ON action_items (entity_id, action_type)
  WHERE resolved_at IS NULL;

ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'action_items_select') THEN
    CREATE POLICY action_items_select ON action_items FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'action_items_insert') THEN
    CREATE POLICY action_items_insert ON action_items FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'action_items' AND policyname = 'action_items_update') THEN
    CREATE POLICY action_items_update ON action_items FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin')
    );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS action_items;
