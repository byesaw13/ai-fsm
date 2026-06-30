-- Migration 135: Add photo waiver support to completion_packets (for no-photo visit completion)
-- Follows pattern of prior additive migrations.

ALTER TABLE completion_packets
  ADD COLUMN IF NOT EXISTS photos_waived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photos_waiver_reason text;

-- No RLS or index changes needed (simple bool + text on existing row).
