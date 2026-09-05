-- Migration 175: push_subscriptions (Web Push / VAPID, EPIC-005 TASK-118).
--
-- One row per browser Push subscription. The PWA subscribes via the Push API and
-- POSTs the subscription here; the web tier sends notifications to these
-- endpoints (the worker has no internet egress, so sends never run there).
-- A person owns their own subscriptions; owner/admin may manage any in the
-- account (mirrors time_clock_sessions RLS). Canonical: EPIC-005.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  -- CASCADE: a push subscription is an ephemeral device token, not history worth
  -- keeping. Removing a user should drop their subscriptions, not block the
  -- delete with a FK violation (there is no user-deactivation flow).
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT        NOT NULL,
  p256dh        TEXT        NOT NULL,
  auth          TEXT        NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Set when a send returns 404/410 (expired); such rows are pruned on send.
  failed_at     TIMESTAMPTZ,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per endpoint per account (re-subscribing upserts).
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_sub_endpoint
  ON push_subscriptions (account_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_push_sub_user
  ON push_subscriptions (account_id, user_id);

CREATE TRIGGER trg_push_subscriptions_updated_at BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions FORCE  ROW LEVEL SECURITY;
DO $$
BEGIN
  -- Account-wide SELECT so a send can resolve recipients (subscriptions are not
  -- sensitive beyond the account boundary).
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='push_sub_select') THEN
    CREATE POLICY push_sub_select ON push_subscriptions FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='push_sub_insert') THEN
    CREATE POLICY push_sub_insert ON push_subscriptions FOR INSERT WITH CHECK (
      account_id = app_account_id()
      AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='push_sub_update') THEN
    CREATE POLICY push_sub_update ON push_subscriptions FOR UPDATE USING (
      account_id = app_account_id()
      AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='push_subscriptions' AND policyname='push_sub_delete') THEN
    CREATE POLICY push_sub_delete ON push_subscriptions FOR DELETE USING (
      account_id = app_account_id()
      AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));
  END IF;
END $$;
