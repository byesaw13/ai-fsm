-- Migration 196: mark staff "view as client" portal sessions (TASK-160).
-- Preview sessions are short-lived and read-only: the portal blocks client
-- actions (pay, approve/decline, SMS opt-out) and skips client view tracking.
ALTER TABLE portal_sessions
  ADD COLUMN is_preview boolean NOT NULL DEFAULT false;

-- Reversal: ALTER TABLE portal_sessions DROP COLUMN is_preview;
