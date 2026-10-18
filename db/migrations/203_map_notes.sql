-- Migration 203: owner notes on the system map.
-- A sentence saved on a bubble is a change request. It is not a backlog task
-- until someone promotes it. Reversal drops the table.

CREATE TABLE IF NOT EXISTS map_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  node_id     TEXT        NOT NULL,
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_notes_account_node
  ON map_notes (account_id, node_id, created_at);

ALTER TABLE map_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_notes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'map_notes' AND policyname = 'map_notes_select') THEN
    CREATE POLICY map_notes_select ON map_notes FOR SELECT
      USING (account_id = app_account_id() AND app_role() = 'owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'map_notes' AND policyname = 'map_notes_insert') THEN
    CREATE POLICY map_notes_insert ON map_notes FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() = 'owner' AND created_by = app_user_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'map_notes' AND policyname = 'map_notes_delete') THEN
    CREATE POLICY map_notes_delete ON map_notes FOR DELETE
      USING (account_id = app_account_id() AND app_role() = 'owner');
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS map_notes;
