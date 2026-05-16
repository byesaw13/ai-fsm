CREATE TABLE property_issues (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id        UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  area               TEXT        NOT NULL,
  item_key           TEXT        NOT NULL,
  title              TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  description        TEXT,
  first_noted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_noted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  occurrence_count   INT         NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  status             TEXT        NOT NULL DEFAULT 'open'
                                 CHECK (status IN ('open','monitoring','resolved','referred')),
  resolved_at        TIMESTAMPTZ,
  resolved_note      TEXT,
  linked_job_ids     UUID[]      NOT NULL DEFAULT '{}',
  linked_estimate_id UUID        REFERENCES estimates(id) ON DELETE SET NULL,
  severity           TEXT        NOT NULL DEFAULT 'minor'
                                 CHECK (severity IN ('minor','moderate','major','critical')),
  auto_detected      BOOLEAN     NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One open/monitoring issue per property+item_key — worker upserts against this
CREATE UNIQUE INDEX idx_property_issues_open_unique
  ON property_issues (property_id, item_key)
  WHERE status IN ('open','monitoring');

CREATE INDEX idx_property_issues_property
  ON property_issues (account_id, property_id, status);

CREATE INDEX idx_property_issues_open
  ON property_issues (account_id, last_noted_at DESC)
  WHERE status IN ('open','monitoring');

CREATE TRIGGER trg_property_issues_updated_at
  BEFORE UPDATE ON property_issues
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE property_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_issues_account ON property_issues;
CREATE POLICY property_issues_account ON property_issues
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
