-- Migration 124: location capture privacy controls (EPIC-007, TASK-046 slice 1).
--
-- Account-level master switch + temporary pause for passive location capture.
-- The ingest endpoint drops events unless: tracking is enabled, not paused, and
-- an active Start-Day workday session exists for the event's date.
-- location_retention_days is added now for a later pruning job (not yet used).

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS location_tracking_enabled BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS location_paused_until     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS location_retention_days   INTEGER     NOT NULL DEFAULT 90;

-- Reversal:
-- ALTER TABLE accounts
--   DROP COLUMN IF EXISTS location_retention_days,
--   DROP COLUMN IF EXISTS location_paused_until,
--   DROP COLUMN IF EXISTS location_tracking_enabled;
