CREATE TABLE property_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  client_id   UUID        REFERENCES clients(id) ON DELETE SET NULL,
  visit_id    UUID        REFERENCES visits(id) ON DELETE SET NULL,
  source      TEXT        NOT NULL DEFAULT 'office'
                          CHECK (source IN ('owner','technician','office')),
  body        TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  pinned      BOOLEAN     NOT NULL DEFAULT false,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_property_notes_property
  ON property_notes (account_id, property_id, created_at DESC);

CREATE INDEX idx_property_notes_pinned
  ON property_notes (account_id, property_id)
  WHERE pinned = true;

ALTER TABLE property_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_notes_account ON property_notes
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
