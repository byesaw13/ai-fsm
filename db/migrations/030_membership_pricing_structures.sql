-- Published pricing structures: one canonical price per tier per account.
-- Plans can reference the active price for their tier; the unique partial index
-- enforces that only one structure per (account, tier) is published at a time.
CREATE TABLE membership_pricing_structures (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tier                TEXT NOT NULL CHECK (tier IN ('essential', 'plus', 'premier')),
  annual_price_cents  INT  NOT NULL DEFAULT 0 CHECK (annual_price_cents >= 0),
  monthly_price_cents INT  NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  is_published        BOOLEAN NOT NULL DEFAULT false,
  published_at        TIMESTAMPTZ,
  notes               TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one published price per tier per account at any time
CREATE UNIQUE INDEX membership_pricing_one_active
  ON membership_pricing_structures (account_id, tier)
  WHERE is_published = true;

CREATE INDEX membership_pricing_account_idx
  ON membership_pricing_structures (account_id);
