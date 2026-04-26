-- ============================================================
-- 013_dovetails_domain.sql
-- Dovetails Services LLC — business-specific schema additions.
--
-- Adds fields required for:
--   - Job type classification and profitability tracking
--   - Painting estimate engine (sq_ft, prep_level, trim)
--   - Internal vs customer-facing pricing separation
--   - Deposit tracking on invoices
--   - Line item type classification
-- ============================================================

-- ---------------------------------------------------------------------------
-- jobs: type + profitability tracking
-- ---------------------------------------------------------------------------

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'custom'
    CHECK (job_type IN ('painting', 'maintenance', 'repair', 'custom')),
  ADD COLUMN IF NOT EXISTS actual_cost_cents INT,
  ADD COLUMN IF NOT EXISTS actual_hours_cents INT,  -- stored as cents of hours * labor_rate
  ADD COLUMN IF NOT EXISTS travel_miles NUMERIC(8,1);

-- ---------------------------------------------------------------------------
-- estimates: Dovetails pricing engine fields
-- ---------------------------------------------------------------------------

ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'flat_rate'
    CHECK (pricing_mode IN ('flat_rate', 'hourly_internal')),
  -- Painting-specific
  ADD COLUMN IF NOT EXISTS sq_ft NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS prep_level INT CHECK (prep_level BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS includes_trim BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS includes_ceiling BOOLEAN NOT NULL DEFAULT false,
  -- Cost tracking (internal only, never shown to customer)
  ADD COLUMN IF NOT EXISTS internal_labor_cost_cents INT,
  ADD COLUMN IF NOT EXISTS internal_material_cost_cents INT,
  ADD COLUMN IF NOT EXISTS target_margin_pct NUMERIC(5,2),
  -- Deposit
  ADD COLUMN IF NOT EXISTS deposit_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_cents INT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- estimate_line_items: type classification
-- ---------------------------------------------------------------------------

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS line_item_type TEXT NOT NULL DEFAULT 'labor'
    CHECK (line_item_type IN ('labor', 'materials', 'handling_fee', 'adjustment')),
  ADD COLUMN IF NOT EXISTS visible_to_customer BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- invoice_line_items: type classification
-- ---------------------------------------------------------------------------

ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS line_item_type TEXT NOT NULL DEFAULT 'labor'
    CHECK (line_item_type IN ('labor', 'materials', 'handling_fee', 'adjustment')),
  ADD COLUMN IF NOT EXISTS visible_to_customer BOOLEAN NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- invoices: deposit tracking
-- ---------------------------------------------------------------------------

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deposit_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_cents INT GENERATED ALWAYS AS
    (total_cents - deposit_cents) STORED;

-- ---------------------------------------------------------------------------
-- expenses: job linkage + category (already has job_id from 007, add category)
-- ---------------------------------------------------------------------------

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'misc'
    CHECK (category IN ('materials', 'fuel', 'tool', 'subcontractor', 'misc'));
