CREATE TABLE property_condition_snapshots (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  property_id UUID        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  visit_id    UUID        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  area        TEXT        NOT NULL,
  condition   TEXT        NOT NULL
                          CHECK (condition IN ('good','fair','poor','critical','not_assessed')),
  note        TEXT,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id, area)
);

CREATE INDEX idx_property_conditions_property
  ON property_condition_snapshots (account_id, property_id, assessed_at DESC);

CREATE INDEX idx_property_conditions_area
  ON property_condition_snapshots (account_id, property_id, area, assessed_at DESC);

ALTER TABLE property_condition_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY property_conditions_account ON property_condition_snapshots
  USING (account_id = current_setting('app.current_account_id', true)::uuid);
