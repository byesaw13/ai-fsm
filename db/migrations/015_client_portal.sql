-- Migration 015: Client portal tokens, signatures, and maintenance plans

-- Share tokens on estimates and invoices (one-click document links)
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS client_approved_name TEXT,
  ADD COLUMN IF NOT EXISTS client_signature_svg TEXT,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS share_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;

-- Per-client portal token (dashboard access)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS portal_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE;

-- Stripe payment intent tracking on invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Maintenance plans
CREATE TABLE IF NOT EXISTS maintenance_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  frequency       TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','biannual','annual')),
  services        TEXT[] NOT NULL DEFAULT '{}',
  price_cents     INT NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  next_scheduled_date DATE,
  notes           TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS maintenance_plans_account_id_idx ON maintenance_plans(account_id);
CREATE INDEX IF NOT EXISTS maintenance_plans_client_id_idx ON maintenance_plans(client_id);

-- Index for token lookups (hot path, unauthenticated)
CREATE INDEX IF NOT EXISTS estimates_share_token_idx ON estimates(share_token);
CREATE INDEX IF NOT EXISTS invoices_share_token_idx ON invoices(share_token);
CREATE INDEX IF NOT EXISTS clients_portal_token_idx ON clients(portal_token);
