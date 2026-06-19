-- Migration 114: location capture — passive, location-based activity capture.
--
-- TASK-024. The installed PWA cannot do background geolocation, so transitions
-- are fed in from the Home Assistant Companion app (native background location)
-- via an authenticated ingest endpoint. Two tables:
--
--   location_events   — append-only raw feed from HA (one row per HA event).
--   location_segments — derived stop/drive segments for the day. These are
--                       PROVISIONAL: they never touch activity_entries or
--                       profitability until the owner labels one, at which point
--                       a real activity_entries row is created and linked back.
--
-- This keeps the activity_entries ledger (its single-active invariant + its
-- profitability rollups) completely clean — location data lives in its own space.

-- ───────────────────────────────────────────────────────────────────────────
-- location_events: raw, append-only feed from the HA Companion app.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_events (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  occurred_at       TIMESTAMPTZ  NOT NULL,
  kind              TEXT         NOT NULL CHECK (kind IN (
                      'zone_enter','zone_leave','location_update','activity_change'
                    )),
  zone              TEXT,                       -- HA zone name (home, ferguson, …) for zone_* events
  latitude          DOUBLE PRECISION,
  longitude         DOUBLE PRECISION,
  geocoded_address  TEXT,
  detected_activity TEXT         CHECK (detected_activity IS NULL OR detected_activity IN (
                      'still','walking','running','in_vehicle','cycling','unknown'
                    )),
  external_id       TEXT,                       -- optional idempotency key from HA
  raw               JSONB,                      -- full original payload for debugging
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Idempotency: HA may retry; the same external_id is ingested once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_events_external
  ON location_events (account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_location_events_account_time
  ON location_events (account_id, occurred_at);

-- ───────────────────────────────────────────────────────────────────────────
-- location_segments: derived stop/drive segments — the labelable day timeline.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS location_segments (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id               UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  segment_date             DATE        NOT NULL DEFAULT CURRENT_DATE,
  kind                     TEXT        NOT NULL CHECK (kind IN ('stop','drive')),
  started_at               TIMESTAMPTZ NOT NULL,
  ended_at                 TIMESTAMPTZ,         -- NULL = currently ongoing
  place_label              TEXT,                -- zone name or geocoded address
  zone                     TEXT,                -- matched HA zone, if any
  latitude                 DOUBLE PRECISION,
  longitude                DOUBLE PRECISION,
  -- A hint only; the real activity_type is enforced on activity_entries at
  -- promotion time, so this is free text (no enum coupling / migration churn).
  suggested_activity_type  TEXT,
  status                   TEXT        NOT NULL DEFAULT 'provisional' CHECK (
                             status IN ('provisional','confirmed','dismissed')
                           ),
  -- Set when the owner labels the segment and it is promoted into the ledger.
  activity_entry_id        UUID        REFERENCES activity_entries(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

-- At most one open (ongoing) segment per account — you're in one place/drive at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_segments_one_open
  ON location_segments (account_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_location_segments_account_date
  ON location_segments (account_id, segment_date);

-- ───────────────────────────────────────────────────────────────────────────
-- RLS (same posture as activity_entries / vehicle_sessions)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE location_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_events   FORCE  ROW LEVEL SECURITY;
ALTER TABLE location_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_segments FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  -- location_events
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_events' AND policyname = 'location_events_select') THEN
    CREATE POLICY location_events_select ON location_events FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_events' AND policyname = 'location_events_insert') THEN
    CREATE POLICY location_events_insert ON location_events FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;

  -- location_segments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_segments' AND policyname = 'location_segments_select') THEN
    CREATE POLICY location_segments_select ON location_segments FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_segments' AND policyname = 'location_segments_insert') THEN
    CREATE POLICY location_segments_insert ON location_segments FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_segments' AND policyname = 'location_segments_update') THEN
    CREATE POLICY location_segments_update ON location_segments FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'location_segments' AND policyname = 'location_segments_delete') THEN
    CREATE POLICY location_segments_delete ON location_segments FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin()
    );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS location_segments;
-- DROP TABLE IF EXISTS location_events;
