-- Migration 213: add-ons the customer ticked when approving (TASK-225).
-- Owner table-freeze exception approved 2026-10-31 (build runbook G6).
-- Additive: one nullable column, no default, no backfill. The previous
-- application never reads or writes it. The immutability trigger guards
-- totals, notes and links on sent quotes, not this column, so approval can
-- record it while the stored total stays the base price.
-- Shape: [{ "id": "a2", "label": "...", "price_cents": 105000 }]

ALTER TABLE estimates ADD COLUMN IF NOT EXISTS approved_add_ons jsonb;

-- Reversal (drops any recorded choices; list them first):
-- SELECT id, approved_add_ons FROM estimates WHERE approved_add_ons IS NOT NULL;
-- ALTER TABLE estimates DROP COLUMN IF EXISTS approved_add_ons;
