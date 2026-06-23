-- Migration 121: visit detection (EPIC-007 slice 1).
--
-- Adds learned geo to properties and a visit_candidates table fed from closed
-- stop segments. "Detected presence" is a visit_candidate — distinct from the
-- scheduled-job `visits` table. Coordinates are learned organically on confirm
-- (no geocoder dependency); distance scoring activates once coords exist.

-- Properties: learned geofence center + metadata.
ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS latitude              DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS geofence_radius_feet  INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN IF NOT EXISTS property_type         TEXT,
  ADD COLUMN IF NOT EXISTS coordinate_source     TEXT,   -- e.g. confirmed_visit | manual | geocoded
  ADD COLUMN IF NOT EXISTS coordinate_confidence TEXT,
  ADD COLUMN IF NOT EXISTS coordinate_updated_at TIMESTAMPTZ;

-- Detected visits awaiting owner review.
CREATE TABLE IF NOT EXISTS visit_candidates (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  location_segment_id  UUID         NOT NULL REFERENCES location_segments(id) ON DELETE CASCADE,
  property_id          UUID         REFERENCES properties(id) ON DELETE SET NULL,
  matched_client_id    UUID         REFERENCES clients(id) ON DELETE SET NULL,
  job_id               UUID         REFERENCES jobs(id) ON DELETE SET NULL,
  visit_id             UUID         REFERENCES visits(id) ON DELETE SET NULL,
  linked_estimate_id   UUID         REFERENCES estimates(id) ON DELETE SET NULL,
  distance_meters      DOUBLE PRECISION,
  confidence_score     INTEGER      NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
  arrival_time         TIMESTAMPTZ  NOT NULL,
  departure_time       TIMESTAMPTZ  NOT NULL,
  duration_minutes     INTEGER      NOT NULL,
  status               TEXT         NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','ignored')),
  classification       TEXT,
  activity_entry_id    UUID         REFERENCES activity_entries(id) ON DELETE SET NULL,
  source               TEXT         NOT NULL DEFAULT 'auto_detected_location',
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- one candidate per detected stop (idempotent re-ingest)
  CONSTRAINT visit_candidates_segment_uniq UNIQUE (location_segment_id)
);

CREATE INDEX IF NOT EXISTS idx_visit_candidates_account_status
  ON visit_candidates (account_id, status);
CREATE INDEX IF NOT EXISTS idx_visit_candidates_property
  ON visit_candidates (account_id, property_id);

ALTER TABLE visit_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_candidates FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_candidates' AND policyname = 'visit_candidates_select') THEN
    CREATE POLICY visit_candidates_select ON visit_candidates FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_candidates' AND policyname = 'visit_candidates_insert') THEN
    CREATE POLICY visit_candidates_insert ON visit_candidates FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_candidates' AND policyname = 'visit_candidates_update') THEN
    CREATE POLICY visit_candidates_update ON visit_candidates FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_candidates' AND policyname = 'visit_candidates_delete') THEN
    CREATE POLICY visit_candidates_delete ON visit_candidates FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin()
    );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS visit_candidates;
-- ALTER TABLE properties
--   DROP COLUMN IF EXISTS coordinate_updated_at, DROP COLUMN IF EXISTS coordinate_confidence,
--   DROP COLUMN IF EXISTS coordinate_source, DROP COLUMN IF EXISTS property_type,
--   DROP COLUMN IF EXISTS geofence_radius_feet, DROP COLUMN IF EXISTS longitude,
--   DROP COLUMN IF EXISTS latitude;
