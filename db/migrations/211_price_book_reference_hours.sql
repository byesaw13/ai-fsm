-- Migration 211: Craftsman reference hours on the price book (TASK-218).
-- One jsonb array per price book code. Each entry is one owner-reviewed,
-- cited Craftsman line: book, edition, line, unit, install / remove / reset
-- hours per unit, optional per-trade minimum, what the line includes.
-- Display only: nothing that prices or sets hours reads this column.
-- Written only by scripts/load-reference-hours.mjs. Default empty array, so
-- existing rows and readers are unchanged. price_book RLS is unchanged
-- (reference table, migration 184).

ALTER TABLE price_book
  ADD COLUMN IF NOT EXISTS reference_hours jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE price_book DROP CONSTRAINT IF EXISTS price_book_reference_hours_is_array;
ALTER TABLE price_book ADD CONSTRAINT price_book_reference_hours_is_array
  CHECK (jsonb_typeof(reference_hours) = 'array');

-- Reversal:
-- ALTER TABLE price_book DROP CONSTRAINT IF EXISTS price_book_reference_hours_is_array;
-- ALTER TABLE price_book DROP COLUMN IF EXISTS reference_hours;
