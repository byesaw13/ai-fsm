-- Link invoices to the visit that triggered auto-creation (closeout chain).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS source_visit_id UUID REFERENCES visits(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_source_visit
  ON invoices (source_visit_id)
  WHERE source_visit_id IS NOT NULL;

-- Backfill from audit log where visit_completion created the invoice.
UPDATE invoices i
SET source_visit_id = (al.new_value->>'visit_id')::uuid
FROM audit_log al
WHERE al.entity_type = 'invoice'
  AND al.entity_id = i.id
  AND al.action = 'insert'
  AND al.new_value->>'source' = 'visit_completion'
  AND al.new_value->>'visit_id' IS NOT NULL
  AND i.source_visit_id IS NULL;