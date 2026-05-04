-- Migration 023: Add default price fields to price_book
-- Adds default_price_cents, add_on_price_cents, and unit_type for estimate auto-fill

ALTER TABLE price_book ADD COLUMN IF NOT EXISTS default_price_cents integer;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS add_on_price_cents integer;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS unit_type text DEFAULT 'flat' CHECK (unit_type IN ('flat','per_unit','per_sqft','per_hour','per_room'));

-- Price book already has an index on `code` from migration 018.
-- No extra index is needed for these added fields.
