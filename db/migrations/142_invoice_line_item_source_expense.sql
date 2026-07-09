-- Trace invoice materials lines back to job expenses (closeout chain).
ALTER TABLE invoice_line_items
  ADD COLUMN IF NOT EXISTS source_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL;

-- Pre-unique-index cleanup: older link flows could bill the same expense twice on one
-- invoice. Keep the earliest line per (invoice_id, source_expense_id); clear the
-- trace on duplicates so invoice totals stay intact.
UPDATE invoice_line_items ili
SET source_expense_id = NULL
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY invoice_id, source_expense_id
           ORDER BY sort_order ASC, created_at ASC, id ASC
         ) AS rn
  FROM invoice_line_items
  WHERE source_expense_id IS NOT NULL
) ranked
WHERE ili.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_line_items_source_expense_unique
  ON invoice_line_items (invoice_id, source_expense_id)
  WHERE source_expense_id IS NOT NULL;