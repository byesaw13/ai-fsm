-- Migration 119: integration_settings — per-account payment-provider config
-- (EPIC-004 / TASK-035, Square first).
--
-- Non-secret config (location/application IDs, environment, enabled) lives in
-- `config` jsonb. Secrets (access token, webhook signature key) are encrypted
-- at rest by the app (AES-256-GCM, key in APP_ENCRYPTION_KEY) and stored as a
-- single bytea blob — never readable from SQL alone. Owner-only via RLS.

CREATE TABLE IF NOT EXISTS integration_settings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider        TEXT        NOT NULL CHECK (provider IN ('square')),
  enabled         BOOLEAN     NOT NULL DEFAULT false,
  environment     TEXT        NOT NULL DEFAULT 'sandbox'
                    CHECK (environment IN ('sandbox','production')),
  config          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  secrets         BYTEA,                       -- encrypted blob, app-managed
  status          TEXT        NOT NULL DEFAULT 'disconnected'
                    CHECK (status IN ('disconnected','connected','error')),
  status_detail   TEXT,
  last_checked_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, provider)
);

CREATE TRIGGER trg_integration_settings_updated_at
  BEFORE UPDATE ON integration_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: owner+admin may read (admin creates payment links, which needs config);
-- only owner may write (manage the connection + secrets). tech has no access.
-- Secrets are encrypted regardless, so a read never yields plaintext.
ALTER TABLE integration_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_settings FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integration_settings' AND policyname = 'integration_settings_select') THEN
    CREATE POLICY integration_settings_select ON integration_settings
      FOR SELECT USING (account_id = app_account_id() AND app_role() IN ('owner','admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integration_settings' AND policyname = 'integration_settings_insert') THEN
    CREATE POLICY integration_settings_insert ON integration_settings
      FOR INSERT WITH CHECK (account_id = app_account_id() AND app_role() = 'owner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'integration_settings' AND policyname = 'integration_settings_update') THEN
    CREATE POLICY integration_settings_update ON integration_settings
      FOR UPDATE USING (account_id = app_account_id() AND app_role() = 'owner')
      WITH CHECK (account_id = app_account_id() AND app_role() = 'owner');
  END IF;
END $$;

-- Rollback:
-- DROP TABLE IF EXISTS integration_settings;
