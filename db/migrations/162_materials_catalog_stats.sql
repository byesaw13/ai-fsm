-- Migration 162: Materials catalog stats (last/avg paid + SKU uniqueness)
-- Supports TASK-085 materials catalog receipt learning.
-- unit_cost_cents remains "last paid"; avg_paid_cents is the running average.

ALTER TABLE materials_price_book
  ADD COLUMN IF NOT EXISTS avg_paid_cents INT
    CHECK (avg_paid_cents IS NULL OR avg_paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS purchase_count INT NOT NULL DEFAULT 0
    CHECK (purchase_count >= 0);

-- Backfill: treat existing unit costs as a single known purchase.
UPDATE materials_price_book
SET avg_paid_cents = unit_cost_cents,
    purchase_count = GREATEST(purchase_count, 1)
WHERE unit_cost_cents > 0
  AND (avg_paid_cents IS NULL OR purchase_count = 0);

-- Dedupe active rows that share the same account + SKU (case/trim insensitive)
-- before enforcing uniqueness. Keep the newest last_purchased_at, then highest
-- purchase_count, then most recently updated. Soft-delete the rest.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY account_id, lower(btrim(sku))
           ORDER BY last_purchased_at DESC NULLS LAST,
                    purchase_count DESC,
                    updated_at DESC NULLS LAST,
                    created_at DESC NULLS LAST,
                    id
         ) AS rn
  FROM materials_price_book
  WHERE is_active = true
    AND sku IS NOT NULL
    AND btrim(sku) <> ''
)
UPDATE materials_price_book m
SET is_active = false,
    notes = COALESCE(m.notes || ' ', '') || '[merged duplicate SKU by migration 162]',
    updated_at = now()
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;

-- One active catalog row per account + SKU (barcode).
CREATE UNIQUE INDEX IF NOT EXISTS idx_mpb_account_sku
  ON materials_price_book (account_id, lower(btrim(sku)))
  WHERE sku IS NOT NULL AND btrim(sku) <> '' AND is_active = true;

-- Reversal:
-- DROP INDEX IF EXISTS idx_mpb_account_sku;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS purchase_count;
-- ALTER TABLE materials_price_book DROP COLUMN IF EXISTS avg_paid_cents;
