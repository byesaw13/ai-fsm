-- Migration 142: Square customer directory fields on clients
--
-- The Square "Customers" CSV export carries fields the clients table did not yet
-- have a home for, so importing dropped them. Add them (all additive/nullable)
-- so a Square customer export transfers cleanly. `square_customer_id` also gives
-- the importer a stable dedupe key (many Square rows have no email).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS nickname                  TEXT,
  ADD COLUMN IF NOT EXISTS address_line2             TEXT,
  ADD COLUMN IF NOT EXISTS birthday                  DATE,
  ADD COLUMN IF NOT EXISTS square_customer_id        TEXT,
  ADD COLUMN IF NOT EXISTS creation_source           TEXT,
  ADD COLUMN IF NOT EXISTS first_visit_at            DATE,
  ADD COLUMN IF NOT EXISTS last_visit_at             DATE,
  ADD COLUMN IF NOT EXISTS transaction_count         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_spend_cents      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS instant_profile           BOOLEAN NOT NULL DEFAULT false;

-- Dedupe / reconcile against Square by its customer id (scoped per account).
CREATE INDEX IF NOT EXISTS idx_clients_account_square_customer
  ON clients (account_id, square_customer_id)
  WHERE square_customer_id IS NOT NULL;

-- Reversal:
--   DROP INDEX IF EXISTS idx_clients_account_square_customer;
--   ALTER TABLE clients
--     DROP COLUMN IF EXISTS nickname, DROP COLUMN IF EXISTS address_line2,
--     DROP COLUMN IF EXISTS birthday, DROP COLUMN IF EXISTS square_customer_id,
--     DROP COLUMN IF EXISTS creation_source, DROP COLUMN IF EXISTS first_visit_at,
--     DROP COLUMN IF EXISTS last_visit_at, DROP COLUMN IF EXISTS transaction_count,
--     DROP COLUMN IF EXISTS lifetime_spend_cents,
--     DROP COLUMN IF EXISTS email_subscription_status, DROP COLUMN IF EXISTS instant_profile;
