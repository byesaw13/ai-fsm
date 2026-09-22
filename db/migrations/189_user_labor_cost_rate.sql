-- Migration 189: Per-person labor cost rate (settle $50/$85; feeds job actuals)
--
-- Cost is a property of the WORKER (pay + burden), not a single company constant.
-- This ends the "which labor-cost number is truth" ambiguity: the account cost
-- clock (business_pricing_settings.labor_cost_cents_per_hour) becomes the fallback,
-- and each person can carry their own pay rate once there is more than one worker.
--
--   cost_cents_per_hour  NULL  => fall back to the account cost clock at read time
--   burden_multiplier          => scales pay -> burdened cost (1.0 = pay only)
--
-- Additive + reversible: nullable rate, defaulted multiplier, backfill only seeds
-- owners from the account rate so margin math is unchanged.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cost_cents_per_hour integer,
  ADD COLUMN IF NOT EXISTS burden_multiplier numeric(5,3) NOT NULL DEFAULT 1.0;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cost_cents_nonneg;
ALTER TABLE users
  ADD CONSTRAINT users_cost_cents_nonneg
  CHECK (cost_cents_per_hour IS NULL OR (cost_cents_per_hour >= 0 AND cost_cents_per_hour <= 50000));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_burden_multiplier_pos;
ALTER TABLE users
  ADD CONSTRAINT users_burden_multiplier_pos
  CHECK (burden_multiplier > 0 AND burden_multiplier <= 5);

-- Backfill: seed each owner's cost from the account's existing cost clock so the
-- profile shows the real number and margin math is unchanged. Accounts with no
-- settings row stay NULL and resolve to the domain default at read time.
UPDATE users u
SET cost_cents_per_hour = bps.labor_cost_cents_per_hour
FROM business_pricing_settings bps
WHERE bps.account_id = u.account_id
  AND u.role = 'owner'
  AND u.cost_cents_per_hour IS NULL;

-- ── Reversal plan ────────────────────────────────────────────────────────────
-- This migration is additive; the runner applies forward files only, so rollback
-- is manual. DATA LOSS WARNING: the columns below hold per-worker pay rates that
-- do not exist anywhere else. Before dropping them, preserve the values if the
-- data matters (they are not recoverable from other tables afterward):
--
--   -- 1. (optional) snapshot the values you would lose
--   CREATE TABLE users_labor_cost_backup_189 AS
--     SELECT id, account_id, cost_cents_per_hour, burden_multiplier FROM users;
--
--   -- 2. drop the additions (reverses this migration)
--   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_burden_multiplier_pos;
--   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_cost_cents_nonneg;
--   ALTER TABLE users DROP COLUMN IF EXISTS burden_multiplier;
--   ALTER TABLE users DROP COLUMN IF EXISTS cost_cents_per_hour;
--
-- Reads tolerate absence: workerCostRateCentsPerHour() falls back to the account
-- cost clock, so dropping the columns degrades to pre-189 behavior (no crash).
