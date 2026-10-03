-- TASK-173 waves 5-6.
-- Account pricing owns the material-handling percent and the card-fee policy.
-- An invoice copies those percents when it leaves draft so a later settings
-- change does not rewrite a bill that was already sent.
-- Each approved work-order task can end as completed, changed, removed/credited,
-- deferred, or not completed. A visit can record materials still needed.

ALTER TABLE business_pricing_settings
  ADD COLUMN IF NOT EXISTS material_handling_pct INTEGER NOT NULL DEFAULT 15
    CHECK (material_handling_pct >= 0 AND material_handling_pct <= 100),
  ADD COLUMN IF NOT EXISTS card_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (card_fee_pct >= 0 AND card_fee_pct <= 10);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS material_handling_pct_snapshot INTEGER
    CHECK (
      material_handling_pct_snapshot IS NULL
      OR (material_handling_pct_snapshot >= 0 AND material_handling_pct_snapshot <= 100)
    ),
  ADD COLUMN IF NOT EXISTS card_fee_pct_snapshot NUMERIC(5,2)
    CHECK (
      card_fee_pct_snapshot IS NULL
      OR (card_fee_pct_snapshot >= 0 AND card_fee_pct_snapshot <= 10)
    );

ALTER TABLE work_order_tasks
  ADD COLUMN IF NOT EXISTS completion_outcome TEXT
    CHECK (
      completion_outcome IS NULL
      OR completion_outcome IN (
        'completed', 'changed', 'removed_credited', 'deferred', 'not_completed'
      )
    );

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS materials_needed TEXT;

-- Rollback:
-- ALTER TABLE visits DROP COLUMN IF EXISTS materials_needed;
-- ALTER TABLE work_order_tasks DROP COLUMN IF EXISTS completion_outcome;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS card_fee_pct_snapshot;
-- ALTER TABLE invoices DROP COLUMN IF EXISTS material_handling_pct_snapshot;
-- ALTER TABLE business_pricing_settings DROP COLUMN IF EXISTS card_fee_pct;
-- ALTER TABLE business_pricing_settings DROP COLUMN IF EXISTS material_handling_pct;
