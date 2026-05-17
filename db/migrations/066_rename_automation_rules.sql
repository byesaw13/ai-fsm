-- automation_rules is a settings/config table (one row per account), not a
-- rules engine. Rename to automation_settings to reflect its actual purpose.
ALTER TABLE automation_rules RENAME TO automation_settings;
ALTER POLICY automation_rules_account ON automation_settings
  RENAME TO automation_settings_account;
