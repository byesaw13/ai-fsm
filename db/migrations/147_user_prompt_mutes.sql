-- Per-user snooze/mute for field prompts (e.g. estimate-not-started nudge).

CREATE TABLE IF NOT EXISTS user_prompt_mutes (
  account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prompt_key   TEXT        NOT NULL,
  muted_until  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, user_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS idx_user_prompt_mutes_active
  ON user_prompt_mutes (account_id, user_id, muted_until);

ALTER TABLE user_prompt_mutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prompt_mutes FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_prompt_mutes' AND policyname = 'user_prompt_mutes_select') THEN
    CREATE POLICY user_prompt_mutes_select ON user_prompt_mutes FOR SELECT USING (
      account_id = app_account_id() AND user_id = app_user_id()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_prompt_mutes' AND policyname = 'user_prompt_mutes_insert') THEN
    CREATE POLICY user_prompt_mutes_insert ON user_prompt_mutes FOR INSERT WITH CHECK (
      account_id = app_account_id() AND user_id = app_user_id()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_prompt_mutes' AND policyname = 'user_prompt_mutes_update') THEN
    CREATE POLICY user_prompt_mutes_update ON user_prompt_mutes FOR UPDATE USING (
      account_id = app_account_id() AND user_id = app_user_id()
    );
  END IF;
END $$;