-- Migration 042: Price Book Enrichment
-- Adds labor hour bands, scope descriptions, legal compliance flags,
-- and a global modifier table to support AI-assisted estimating.
-- All changes are additive and reversible.

-- ---------------------------------------------------------------------------
-- Add enrichment columns to price_book
-- ---------------------------------------------------------------------------

ALTER TABLE price_book ADD COLUMN IF NOT EXISTS labor_hours_low     DECIMAL(5,2);
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS labor_hours_typical  DECIMAL(5,2);
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS labor_hours_high    DECIMAL(5,2);
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS scope_description   TEXT;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS excluded_items      TEXT;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS legal_status_ma     TEXT NOT NULL DEFAULT 'legal'
  CHECK (legal_status_ma IN ('legal','gray','restricted'));
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS legal_status_nh     TEXT NOT NULL DEFAULT 'legal'
  CHECK (legal_status_nh IN ('legal','gray','restricted'));
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS two_person_required  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE price_book ADD COLUMN IF NOT EXISTS quote_trigger        BOOLEAN NOT NULL DEFAULT false;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_price_book_legal_ma ON price_book (legal_status_ma) WHERE legal_status_ma <> 'legal';
CREATE INDEX IF NOT EXISTS idx_price_book_quote_trigger ON price_book (quote_trigger) WHERE quote_trigger = true;

-- ---------------------------------------------------------------------------
-- Modifier table: conditions that adjust any task's cost or time
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS price_book_modifiers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    VARCHAR(100) NOT NULL UNIQUE,
  description             TEXT,
  labor_hours_adjustment  DECIMAL(5,2),
  labor_pct_adjustment    DECIMAL(5,4),
  cost_adjustment_cents   INT,
  applies_when            TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ DEFAULT now()
);

INSERT INTO price_book_modifiers (name, description, labor_hours_adjustment, labor_pct_adjustment, cost_adjustment_cents, applies_when) VALUES
(
  'plaster_walls',
  'Wall material is plaster instead of drywall — slower cutting, patching, and feathering',
  0.50, 0.25, NULL,
  'plaster walls, lath and plaster, old plaster, horsehair plaster, pre-1940 home'
),
(
  'lead_rrp_containment',
  'Pre-1978 home triggers EPA Lead-RRP containment: tent setup, HEPA vacuum, disposal bags',
  0.75, NULL, 5000,
  'pre-1978, 1970s, 1960s, older home, lead paint, renovation in older home, lead-safe'
),
(
  'crawl_space_access',
  'Work area requires access through a crawl space — tight quarters, awkward positioning',
  1.00, NULL, NULL,
  'crawl space, under house, under floor, below floor access'
),
(
  'attic_access',
  'Work area accessed through attic — setup time for ladder, boards, and lighting',
  0.50, NULL, NULL,
  'attic, through attic, attic access, run wire through attic, ceiling from attic'
),
(
  'second_story_exterior',
  'Second-story exterior work with no ground access — extension ladder required',
  0.25, NULL, NULL,
  'second story, second floor exterior, above garage, ladder work, high gutter, 16-foot ladder'
),
(
  'basement_ladder_access',
  'Overhead work in basement or drop-ceiling area — ladder setup and repositioning',
  0.50, NULL, NULL,
  'basement, drop ceiling, overhead basement work, finished basement ceiling'
),
(
  'galvanized_old_plumbing',
  'Galvanized or pre-1960 plumbing — fittings may corrode or strip on removal',
  0.50, NULL, NULL,
  'galvanized, old pipes, corroded fittings, iron pipes, pre-1960, black pipe'
),
(
  'knob_and_tube_wiring',
  'Stop-work condition: knob-and-tube or aluminum wiring detected — refer to licensed electrician',
  NULL, NULL, NULL,
  'knob and tube, aluminum wiring, cloth wiring, old wiring, 1950s wiring, fuse box'
),
(
  'nh_frost_line_footing',
  'NH frost-line depth requirement for in-ground posts or footings adds dig time',
  0.75, NULL, NULL,
  'post in ground, deck footing, fence post, NH deck, concrete footing, frost line, New Hampshire post'
),
(
  'emergency_response',
  'True emergency (active water leak, electrical hazard) — 2x rate + $200 dispatch applies',
  NULL, 1.00, 20000,
  'emergency, active leak, flooding, electrical hazard, urgent tonight, right now, same night, burst pipe'
)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Reversal (for reference — run manually if migration needs to be rolled back)
-- ---------------------------------------------------------------------------
-- DROP TABLE IF EXISTS price_book_modifiers;
-- ALTER TABLE price_book
--   DROP COLUMN IF EXISTS labor_hours_low,
--   DROP COLUMN IF EXISTS labor_hours_typical,
--   DROP COLUMN IF EXISTS labor_hours_high,
--   DROP COLUMN IF EXISTS scope_description,
--   DROP COLUMN IF EXISTS excluded_items,
--   DROP COLUMN IF EXISTS legal_status_ma,
--   DROP COLUMN IF EXISTS legal_status_nh,
--   DROP COLUMN IF EXISTS two_person_required,
--   DROP COLUMN IF EXISTS quote_trigger;
