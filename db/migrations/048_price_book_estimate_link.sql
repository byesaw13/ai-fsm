-- Migration 048: Link estimate line items to price book entries
-- Additive only — preserves snapshot pricing on each line, adds traceability.

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS price_book_id uuid REFERENCES price_book(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_price_book
  ON estimate_line_items (price_book_id)
  WHERE price_book_id IS NOT NULL;
