-- Per-invoice toggle for auto material handling fee (default on; rate lives in account settings).
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS apply_material_handling boolean NOT NULL DEFAULT true;