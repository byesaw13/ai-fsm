-- Migration 020: Good/Better/Best multi-option estimates
-- Supports presenting clients with multiple pricing tiers on a single estimate.

-- Presentation mode on estimates
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS presentation_mode TEXT NOT NULL DEFAULT 'standard'
    CHECK (presentation_mode IN ('standard', 'multi_option'));

-- Estimate options table (Good/Better/Best tiers)
CREATE TABLE IF NOT EXISTS estimate_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id     UUID NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,                    -- e.g. "Good", "Better", "Best"
  description     TEXT,                             -- Option-level description
  sort_order      INT NOT NULL DEFAULT 0,
  subtotal_cents  INT NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents       INT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents     INT NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  is_recommended  BOOLEAN NOT NULL DEFAULT FALSE,   -- Highlight this option
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_options_estimate_id_idx ON estimate_options(estimate_id);

-- Link line items to options (NULL = belongs to estimate directly for standard mode)
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS option_id UUID REFERENCES estimate_options(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS estimate_line_items_option_id_idx ON estimate_line_items(option_id)
  WHERE option_id IS NOT NULL;
