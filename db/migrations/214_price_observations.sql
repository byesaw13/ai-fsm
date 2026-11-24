-- Migration 214: price observation ledger and catalog variants (TASK-210).
--
-- price_observations is the price truth (append-only; only status and voided_at
-- change after insert). materials_price_book rows become product variants: one per
-- account, store family and SKU. Their price columns (unit_cost_cents,
-- avg_paid_cents, purchase_count, last_purchased_at) are a cache the app recomputes
-- from the ledger in the same transaction as each new observation.
--
-- Compatibility with the previous release:
-- - New table and new nullable/defaulted columns only; the previous code never
--   reads or writes them.
-- - idx_mpb_account_sku (one row per SKU) is replaced by idx_mpb_variant_sku (one
--   row per store family and SKU). It is looser, and no code uses it in an
--   ON CONFLICT clause, so the previous code's inserts and updates keep working.
-- - idx_mpb_account_name_unit is kept: two routes in the previous release use it in
--   ON CONFLICT. (A second store's variant with the same name gets the store added
--   to its name in the app.)
-- - store_family is filled from supplier with the same rule as storeFamilyOf() in
--   packages/domain/src/price-evidence.ts.
-- Reversal at the bottom.

CREATE TABLE IF NOT EXISTS price_observations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  variant_id       UUID        NOT NULL REFERENCES materials_price_book(id) ON DELETE CASCADE,
  kind             TEXT        NOT NULL CHECK (kind IN (
                     'receipt', 'supplier_csv', 'supplier_quote', 'manual_check', 'catalog_summary', 'ai_allowance'
                   )),
  observed_on      DATE        NOT NULL,
  unit_price_cents INTEGER     NOT NULL CHECK (unit_price_cents >= 0),
  store_family     TEXT        NOT NULL CHECK (store_family IN ('home_depot', 'lowes', 'other')),
  store_number     TEXT,
  location         TEXT,
  is_sale          BOOLEAN     NOT NULL DEFAULT false,
  reconciled       BOOLEAN     NOT NULL DEFAULT false,
  expires_on       DATE,
  quote_quantity   NUMERIC,
  status           TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'pending', 'superseded', 'dismissed')),
  source_ref       TEXT        NOT NULL,
  dedupe_key       TEXT        NOT NULL,
  entered_by       UUID        REFERENCES users(id) ON DELETE SET NULL,
  note             TEXT,
  voided_at        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_price_observations_dedupe UNIQUE (account_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_price_observations_variant
  ON price_observations (account_id, variant_id, observed_on DESC);
CREATE INDEX IF NOT EXISTS idx_price_observations_source
  ON price_observations (account_id, source_ref);

ALTER TABLE price_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_observations FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_observations' AND policyname = 'price_observations_select') THEN
    CREATE POLICY price_observations_select ON price_observations FOR SELECT
      USING (account_id = app_account_id());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_observations' AND policyname = 'price_observations_insert') THEN
    CREATE POLICY price_observations_insert ON price_observations FOR INSERT
      WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'price_observations' AND policyname = 'price_observations_update') THEN
    CREATE POLICY price_observations_update ON price_observations FOR UPDATE
      USING (account_id = app_account_id() AND app_role() IN ('owner', 'admin'));
  END IF;
END $$;

ALTER TABLE materials_price_book
  ADD COLUMN IF NOT EXISTS store_family TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS package_qty NUMERIC,
  ADD COLUMN IF NOT EXISTS package_unit TEXT,
  ADD COLUMN IF NOT EXISTS package_source TEXT,
  ADD COLUMN IF NOT EXISTS same_product_group UUID;

ALTER TABLE materials_price_book DROP CONSTRAINT IF EXISTS materials_price_book_store_family_check;
ALTER TABLE materials_price_book
  ADD CONSTRAINT materials_price_book_store_family_check
  CHECK (store_family IN ('home_depot', 'lowes', 'other'));
ALTER TABLE materials_price_book DROP CONSTRAINT IF EXISTS materials_price_book_package_source_check;
ALTER TABLE materials_price_book
  ADD CONSTRAINT materials_price_book_package_source_check
  CHECK (package_source IS NULL OR package_source IN ('description', 'owner'));

UPDATE materials_price_book
SET store_family = CASE
  WHEN btrim(regexp_replace(lower(coalesce(supplier, '')), '[^a-z0-9]+', ' ', 'g')) LIKE '%home depot%'
    OR btrim(regexp_replace(lower(coalesce(supplier, '')), '[^a-z0-9]+', ' ', 'g')) LIKE '%homedepot%'
    OR btrim(regexp_replace(lower(coalesce(supplier, '')), '[^a-z0-9]+', ' ', 'g')) ~ '^hd [0-9]'
    THEN 'home_depot'
  WHEN lower(coalesce(supplier, '')) LIKE '%lowe%' THEN 'lowes'
  ELSE 'other'
END
WHERE store_family = 'other';

DROP INDEX IF EXISTS idx_mpb_account_sku;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpb_variant_sku
  ON materials_price_book (account_id, store_family, lower(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '' AND is_active = true;

-- Reversal (restoring idx_mpb_account_sku fails if the same SKU is now active at two
-- stores; deactivate or merge those rows first):
-- DROP INDEX IF EXISTS idx_mpb_variant_sku;
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_mpb_account_sku ON materials_price_book (account_id, lower(btrim(sku)))
--   WHERE sku IS NOT NULL AND btrim(sku) <> '' AND is_active = true;
-- ALTER TABLE materials_price_book DROP CONSTRAINT IF EXISTS materials_price_book_package_source_check;
-- ALTER TABLE materials_price_book DROP CONSTRAINT IF EXISTS materials_price_book_store_family_check;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS same_product_group;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS package_source;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS package_unit;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS package_qty;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS store_family;
-- DROP TABLE IF EXISTS price_observations;
