-- Migration 046: Estimate Engine spec storage and pricing rule snapshots
-- Additive only — no existing columns or data affected.

-- Add engine columns to estimates table
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS engine_spec        jsonb,
  ADD COLUMN IF NOT EXISTS engine_version     text,
  ADD COLUMN IF NOT EXISTS rules_version      text,
  ADD COLUMN IF NOT EXISTS computed_result    jsonb,
  ADD COLUMN IF NOT EXISTS last_computed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS parent_estimate_id uuid REFERENCES estimates(id),
  ADD COLUMN IF NOT EXISTS revision           smallint NOT NULL DEFAULT 1;

-- Index for revision chains
CREATE INDEX IF NOT EXISTS idx_estimates_parent
  ON estimates (account_id, parent_estimate_id)
  WHERE parent_estimate_id IS NOT NULL;

-- Versioned pricing rule snapshots so old estimates can be exactly re-derived
CREATE TABLE IF NOT EXISTS pricing_rule_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version      text NOT NULL,
  rules        jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES users(id),
  UNIQUE (account_id, version)
);

-- RLS: only own account's snapshots visible
ALTER TABLE pricing_rule_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_rule_snapshots_account ON pricing_rule_snapshots;
CREATE POLICY pricing_rule_snapshots_account
  ON pricing_rule_snapshots
  USING (account_id = current_setting('app.account_id', true)::uuid);
