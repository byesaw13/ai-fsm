-- Migration 175: capture_evidence — immutable originals for TASK-115 Promise Capture Pilot.
-- Processing state lives here. Operational completion does not.

CREATE TABLE IF NOT EXISTS capture_evidence (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by            UUID        NOT NULL REFERENCES users(id),
  captured_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  source                TEXT        NOT NULL CHECK (source IN ('recorder', 'share_target', 'typed')),
  audio_filename        TEXT,
  audio_original_name   TEXT,
  audio_mime_type       TEXT,
  audio_size_bytes      INTEGER,
  photo_filename        TEXT,
  photo_original_name   TEXT,
  photo_mime_type       TEXT,
  photo_size_bytes      INTEGER,
  transcript            TEXT,
  processing_state      TEXT        NOT NULL DEFAULT 'pending'
    CHECK (processing_state IN (
      'pending',
      'transcribed',
      'proposed',
      'low_confidence',
      'awaiting_review',
      'snoozed',
      'confirmed',
      'dismissed',
      'failed'
    )),
  proposed_title        TEXT,
  proposed_due_at       TIMESTAMPTZ,
  proposed_span         TEXT,
  confidence            TEXT        CHECK (confidence IS NULL OR confidence IN ('high', 'low')),
  suggested_entity_type TEXT        CHECK (
    suggested_entity_type IS NULL
    OR suggested_entity_type IN ('booking_request', 'estimate', 'job', 'invoice')
  ),
  suggested_entity_id   UUID,
  snoozed_at            TIMESTAMPTZ,
  snooze_count          INTEGER     NOT NULL DEFAULT 0
    CHECK (snooze_count >= 0 AND snooze_count <= 1),
  confirmed_at          TIMESTAMPTZ,
  dismissed_at          TIMESTAMPTZ,
  processing_error      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capture_evidence_account_state
  ON capture_evidence (account_id, processing_state, captured_at);

CREATE INDEX IF NOT EXISTS idx_capture_evidence_account_captured
  ON capture_evidence (account_id, captured_at DESC);

ALTER TABLE capture_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE capture_evidence FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'capture_evidence' AND policyname = 'capture_evidence_select'
  ) THEN
    CREATE POLICY capture_evidence_select ON capture_evidence
      FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'capture_evidence' AND policyname = 'capture_evidence_insert'
  ) THEN
    CREATE POLICY capture_evidence_insert ON capture_evidence
      FOR INSERT WITH CHECK (
        account_id = app_account_id() AND app_role() IN ('owner', 'admin')
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'capture_evidence' AND policyname = 'capture_evidence_update'
  ) THEN
    CREATE POLICY capture_evidence_update ON capture_evidence
      FOR UPDATE USING (
        account_id = app_account_id() AND app_role() IN ('owner', 'admin')
      );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE IF EXISTS capture_evidence;
