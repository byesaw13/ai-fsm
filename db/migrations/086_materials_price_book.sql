-- Migration 086: Materials price book
-- Stores actual material prices the owner has paid, keyed per account.
-- Claude uses these saved prices for future estimates instead of guessing;
-- new items fall back to Claude's market-rate estimates until first purchase.

CREATE TABLE IF NOT EXISTS materials_price_book (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name              TEXT         NOT NULL,
  brand             TEXT,
  -- category: paint | lumber | hardware | concrete | fasteners | sheet_goods | trim | flooring | other
  category          TEXT         NOT NULL DEFAULT 'other',
  unit              TEXT         NOT NULL DEFAULT 'each',
  unit_cost_cents   INT          NOT NULL DEFAULT 0 CHECK (unit_cost_cents >= 0),
  supplier          TEXT,
  sku               TEXT,
  last_purchased_at DATE,
  notes             TEXT,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  created_by        UUID         REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mpb_account          ON materials_price_book (account_id);
CREATE INDEX IF NOT EXISTS idx_mpb_account_category ON materials_price_book (account_id, category);
CREATE INDEX IF NOT EXISTS idx_mpb_account_name     ON materials_price_book (account_id, lower(name));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_materials_price_book_updated'
      AND tgrelid = 'materials_price_book'::regclass
  ) THEN
    CREATE TRIGGER trg_materials_price_book_updated
      BEFORE UPDATE ON materials_price_book
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- RLS
ALTER TABLE materials_price_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials_price_book FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials_price_book' AND policyname = 'mpb_select') THEN
    CREATE POLICY mpb_select ON materials_price_book FOR SELECT USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials_price_book' AND policyname = 'mpb_insert') THEN
    CREATE POLICY mpb_insert ON materials_price_book FOR INSERT WITH CHECK (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin', 'tech')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials_price_book' AND policyname = 'mpb_update') THEN
    CREATE POLICY mpb_update ON materials_price_book FOR UPDATE USING (
      account_id = app_account_id() AND app_role() IN ('owner', 'admin')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'materials_price_book' AND policyname = 'mpb_delete') THEN
    CREATE POLICY mpb_delete ON materials_price_book FOR DELETE USING (
      account_id = app_account_id() AND is_owner_or_admin()
    );
  END IF;
END $$;

-- Reversal:
-- DROP TABLE materials_price_book;
