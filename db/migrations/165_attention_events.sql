-- Migration 165: Account-level attention events (in-app activity feed).
-- Queue badges use live SQL counts; this table is only for "something happened" events.
-- Retention: product keeps last 90 days (app queries + optional prune).

CREATE TABLE IF NOT EXISTS attention_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type         text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  title        text NOT NULL,
  summary      text,
  href         text NOT NULL,
  dedupe_key   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS attention_events_account_dedupe_uidx
  ON attention_events (account_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS attention_events_account_created_idx
  ON attention_events (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS attention_events_account_unread_idx
  ON attention_events (account_id, created_at DESC)
  WHERE read_at IS NULL;

COMMENT ON TABLE attention_events IS
  'Owner/admin activity feed: client opens, approvals, payments, new requests. Not queue badges.';

-- Rollback:
-- DROP TABLE IF EXISTS attention_events;
