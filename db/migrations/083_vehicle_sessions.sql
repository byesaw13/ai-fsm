-- Migration 083: Vehicle sessions
-- Replaces mileage_logs with vehicle_sessions + vehicle_session_activities.
-- One session covers an entire vehicle outing; multiple activities (jobs, visits,
-- estimates, supplier runs) attach to a single odometer range.

CREATE TABLE IF NOT EXISTS vehicle_sessions (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  vehicle_id     UUID         REFERENCES vehicles(id) ON DELETE SET NULL,
  session_date   DATE         NOT NULL,
  start_odometer INTEGER      CHECK (start_odometer >= 0),
  end_odometer   INTEGER      CHECK (end_odometer >= 0),
  miles          NUMERIC(8,2),
  notes          TEXT,
  created_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT vehicle_sessions_value_check CHECK (
    (miles IS NOT NULL AND miles > 0)
    OR (start_odometer IS NOT NULL AND end_odometer IS NOT NULL AND end_odometer > start_odometer)
  ),
  CONSTRAINT vehicle_sessions_odometer_pair CHECK (
    (start_odometer IS NULL) = (end_odometer IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS vehicle_session_activities (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID        NOT NULL REFERENCES vehicle_sessions(id) ON DELETE CASCADE,
  entity_type TEXT        NOT NULL CHECK (entity_type IN ('job', 'visit', 'estimate', 'supplier_run', 'other')),
  entity_id   UUID,
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_sessions_account      ON vehicle_sessions (account_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_sessions_account_date ON vehicle_sessions (account_id, session_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_sessions_vehicle      ON vehicle_sessions (vehicle_id) WHERE vehicle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vsa_session                   ON vehicle_session_activities (session_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_vehicle_sessions_updated' AND tgrelid = 'vehicle_sessions'::regclass
  ) THEN
    CREATE TRIGGER trg_vehicle_sessions_updated
      BEFORE UPDATE ON vehicle_sessions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Migrate mileage_logs → vehicle_sessions
-- Merges purpose + notes into a single notes field
INSERT INTO vehicle_sessions
  (id, account_id, vehicle_id, session_date, start_odometer, end_odometer, miles, notes, created_by, created_at, updated_at)
SELECT
  id, account_id, vehicle_id, trip_date, start_odometer, end_odometer,
  miles,
  NULLIF(TRIM(BOTH FROM CONCAT_WS(' — ', NULLIF(TRIM(purpose), ''), NULLIF(TRIM(notes), ''))), ''),
  created_by, created_at, updated_at
FROM mileage_logs
ON CONFLICT (id) DO NOTHING;

-- Migrate entity links → activities
INSERT INTO vehicle_session_activities (session_id, entity_type, entity_id)
SELECT id, 'job', job_id FROM mileage_logs WHERE job_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO vehicle_session_activities (session_id, entity_type, entity_id)
SELECT id, 'visit', visit_id FROM mileage_logs WHERE visit_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO vehicle_session_activities (session_id, entity_type, entity_id)
SELECT id, 'estimate', estimate_id FROM mileage_logs WHERE estimate_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- material_pickup sessions with no entity link → supplier_run activity
INSERT INTO vehicle_session_activities (session_id, entity_type, label)
SELECT id, 'supplier_run', 'Material Pickup'
FROM mileage_logs
WHERE trip_type = 'material_pickup'
  AND job_id IS NULL AND visit_id IS NULL AND estimate_id IS NULL
ON CONFLICT DO NOTHING;

-- personal sessions → other activity
INSERT INTO vehicle_session_activities (session_id, entity_type, label)
SELECT id, 'other', 'Personal'
FROM mileage_logs
WHERE trip_type = 'personal'
  AND job_id IS NULL AND visit_id IS NULL AND estimate_id IS NULL
ON CONFLICT DO NOTHING;

-- mileage_logs intentionally NOT dropped here.
-- Migration 083 migrates data into vehicle_sessions.
-- Routes and reports updated to query vehicle_sessions directly.
-- mileage_logs will be removed in a future cleanup migration.

-- RLS: vehicle_sessions
ALTER TABLE vehicle_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_sessions FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_sessions' AND policyname = 'vehicle_sessions_select') THEN
    CREATE POLICY vehicle_sessions_select ON vehicle_sessions FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_sessions' AND policyname = 'vehicle_sessions_insert') THEN
    CREATE POLICY vehicle_sessions_insert ON vehicle_sessions FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_sessions' AND policyname = 'vehicle_sessions_update') THEN
    CREATE POLICY vehicle_sessions_update ON vehicle_sessions FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_sessions' AND policyname = 'vehicle_sessions_delete') THEN
    CREATE POLICY vehicle_sessions_delete ON vehicle_sessions FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin()
    );
  END IF;
END $$;

-- RLS: vehicle_session_activities (scoped via session membership)
ALTER TABLE vehicle_session_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_session_activities FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_session_activities' AND policyname = 'vsa_select') THEN
    CREATE POLICY vsa_select ON vehicle_session_activities FOR SELECT USING (
      EXISTS (SELECT 1 FROM vehicle_sessions s WHERE s.id = session_id AND s.account_id = app_account_id())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_session_activities' AND policyname = 'vsa_insert') THEN
    CREATE POLICY vsa_insert ON vehicle_session_activities FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM vehicle_sessions s WHERE s.id = session_id AND s.account_id = app_account_id())
      AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vehicle_session_activities' AND policyname = 'vsa_delete') THEN
    CREATE POLICY vsa_delete ON vehicle_session_activities FOR DELETE USING (
      EXISTS (SELECT 1 FROM vehicle_sessions s WHERE s.id = session_id AND s.account_id = app_account_id())
      AND is_owner_or_admin()
    );
  END IF;
END $$;

-- Reversal:
-- CREATE TABLE mileage_logs ... (see migration 008 + 082 for schema)
-- INSERT INTO mileage_logs SELECT ... FROM vehicle_sessions (single-activity sessions only)
-- DROP TABLE vehicle_session_activities;
-- DROP TABLE vehicle_sessions;
