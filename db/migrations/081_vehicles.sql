-- Migration 081: Vehicles table
-- Tracks named vehicles used for mileage logging.
-- Each account manages its own fleet; Dovetails has two: Ram 1500 and Pathfinder.

CREATE TABLE IF NOT EXISTS vehicles (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  nickname    TEXT        NOT NULL,
  make        TEXT,
  model       TEXT,
  year        SMALLINT,
  plate       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicles_account ON vehicles (account_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_account_active ON vehicles (account_id) WHERE is_active = true;

CREATE OR REPLACE FUNCTION update_vehicles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vehicles_updated ON vehicles;
CREATE TRIGGER trg_vehicles_updated
  BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_vehicles_timestamp();

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;

CREATE POLICY vehicles_select ON vehicles FOR SELECT USING (account_id = app_account_id());
CREATE POLICY vehicles_insert ON vehicles FOR INSERT WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
CREATE POLICY vehicles_update ON vehicles FOR UPDATE USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
CREATE POLICY vehicles_delete ON vehicles FOR DELETE USING (account_id = app_account_id() AND is_owner_or_admin());

-- Reversal:
-- DROP TABLE IF EXISTS vehicles;
