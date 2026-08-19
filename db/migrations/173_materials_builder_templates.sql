-- Pricing truth + materials builder foundations
-- Phase P: price_book verification provenance
-- Phase 0–1: catalog deep links + task→materials templates + buy-list roles

ALTER TABLE price_book
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pricing_method TEXT
    CHECK (pricing_method IS NULL OR pricing_method IN ('package', 'hourly', 'per_unit')),
  ADD COLUMN IF NOT EXISTS source_note TEXT;

ALTER TABLE materials_price_book
  ADD COLUMN IF NOT EXISTS preferred_vendor TEXT
    CHECK (preferred_vendor IS NULL OR preferred_vendor IN ('home_depot', 'lowes', 'other')),
  ADD COLUMN IF NOT EXISTS product_url TEXT,
  ADD COLUMN IF NOT EXISTS search_query TEXT,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- Normalize common supplier drift into preferred_vendor where empty
UPDATE materials_price_book
SET preferred_vendor = CASE
  WHEN lower(coalesce(supplier, '')) LIKE '%lowe%' THEN 'lowes'
  WHEN lower(coalesce(supplier, '')) LIKE '%home depot%'
    OR lower(coalesce(supplier, '')) LIKE '%homedepot%' THEN 'home_depot'
  WHEN supplier IS NOT NULL AND btrim(supplier) <> '' THEN 'other'
  ELSE preferred_vendor
END
WHERE preferred_vendor IS NULL;

ALTER TABLE job_material_lines
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'must_buy'
    CHECK (role IN ('must_buy', 'optional', 'consumable')),
  ADD COLUMN IF NOT EXISTS generation_source TEXT
    CHECK (generation_source IS NULL OR generation_source IN (
      'template', 'ai', 'estimate', 'manual', 'kit'
    )),
  ADD COLUMN IF NOT EXISTS price_book_code TEXT;

CREATE TABLE IF NOT EXISTS price_book_material_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_book_id UUID NOT NULL REFERENCES price_book(id) ON DELETE CASCADE,
  catalog_material_id UUID REFERENCES materials_price_book(id) ON DELETE SET NULL,
  material_name TEXT NOT NULL CHECK (btrim(material_name) <> ''),
  quantity_type TEXT NOT NULL
    CHECK (quantity_type IN ('static', 'per_input', 'tier')),
  quantity_flat NUMERIC,
  input_key TEXT,
  quantity_multiplier NUMERIC,
  waste_factor NUMERIC NOT NULL DEFAULT 1.0
    CHECK (waste_factor > 0 AND waste_factor <= 3),
  role TEXT NOT NULL DEFAULT 'must_buy'
    CHECK (role IN ('must_buy', 'optional', 'consumable')),
  unit_label TEXT,
  store_section TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pbmt_price_book
  ON price_book_material_templates (price_book_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pbmt_task_name
  ON price_book_material_templates (
    price_book_id,
    lower(btrim(material_name)),
    COALESCE(catalog_material_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

DROP TRIGGER IF EXISTS trg_price_book_material_templates_updated
  ON price_book_material_templates;
CREATE TRIGGER trg_price_book_material_templates_updated
  BEFORE UPDATE ON price_book_material_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Global read for authenticated app sessions (price_book is global reference data).
-- Templates inherit: any account can read; writes owner/admin via API (no RLS user table).
ALTER TABLE price_book_material_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_book_material_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pbmt_select ON price_book_material_templates;
CREATE POLICY pbmt_select
  ON price_book_material_templates FOR SELECT
  USING (app_account_id() IS NOT NULL);

DROP POLICY IF EXISTS pbmt_insert ON price_book_material_templates;
CREATE POLICY pbmt_insert
  ON price_book_material_templates FOR INSERT
  WITH CHECK (app_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS pbmt_update ON price_book_material_templates;
CREATE POLICY pbmt_update
  ON price_book_material_templates FOR UPDATE
  USING (app_role() IN ('owner', 'admin'))
  WITH CHECK (app_role() IN ('owner', 'admin'));

DROP POLICY IF EXISTS pbmt_delete ON price_book_material_templates;
CREATE POLICY pbmt_delete
  ON price_book_material_templates FOR DELETE
  USING (app_role() IN ('owner', 'admin'));

-- Seed starter templates for common codes (skip if code missing)
INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, v.material_name, v.quantity_type, v.quantity_flat, v.input_key,
       v.quantity_multiplier, v.waste_factor, v.role, v.unit_label, v.store_section, v.sort_order
FROM price_book pb
JOIN (
  VALUES
    ('4010'::text, 'Exterior-grade construction adhesive'::text, 'static'::text, 1::numeric, NULL::text, NULL::numeric, 1.0::numeric, 'must_buy'::text, 'tube'::text, 'Adhesives'::text, 10),
    ('4010', 'Shims (pack)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'pack', 'Lumber', 20),
    ('4010', '3" exterior wood screws (1 lb)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'box', 'Fasteners', 30),
    ('4010', 'Paintable exterior caulk', 'static', 1, NULL, NULL, 1.0, 'optional', 'tube', 'Paint', 40),
    ('4005', 'Shelf brackets / standards hardware', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'set', 'Hardware', 10),
    ('4005', 'Wall anchors (toggle or molly) pack', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'pack', 'Hardware', 20),
    ('4005', 'Construction screws 2-1/2" (box)', 'static', 1, NULL, NULL, 1.0, 'consumable', 'box', 'Fasteners', 30)
) AS v(code, material_name, quantity_type, quantity_flat, input_key,
       quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
  ON pb.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM price_book_material_templates x
  WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(v.material_name)
);

-- Broader seeds by name match for high-frequency tasks without fixed codes in VALUES
INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, t.material_name, t.quantity_type, t.quantity_flat, t.input_key,
       t.quantity_multiplier, t.waste_factor, t.role, t.unit_label, t.store_section, t.sort_order
FROM price_book pb
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Toilet wax ring (reinforced)', 'static', 1::numeric, NULL::text, NULL::numeric, 1.0, 'must_buy', 'ea', 'Plumbing', 10),
    ('Toilet supply line 3/8" × 12"', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'ea', 'Plumbing', 20),
    ('Toilet bolt kit', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'set', 'Plumbing', 30),
    ('Silicone sealant — white', 'static', 1, NULL, NULL, 1.0, 'optional', 'tube', 'Plumbing', 40)
  ) AS x(material_name, quantity_type, quantity_flat, input_key, quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
) t
WHERE lower(pb.name) LIKE '%toilet%'
  AND NOT EXISTS (
    SELECT 1 FROM price_book_material_templates x
    WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(t.material_name)
  );

INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, t.material_name, t.quantity_type, t.quantity_flat, t.input_key,
       t.quantity_multiplier, t.waste_factor, t.role, t.unit_label, t.store_section, t.sort_order
FROM price_book pb
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Door hinge set (3-pack)', 'static', 1::numeric, NULL::text, NULL::numeric, 1.0, 'must_buy', 'set', 'Hardware', 10),
    ('Passage / privacy knob set', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'set', 'Hardware', 20),
    ('Wood shims (pack)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'pack', 'Lumber', 30),
    ('Finish nails 2" (box)', 'static', 1, NULL, NULL, 1.0, 'consumable', 'box', 'Fasteners', 40),
    ('Wood glue (bottle)', 'static', 1, NULL, NULL, 1.0, 'optional', 'ea', 'Adhesives', 50)
  ) AS x(material_name, quantity_type, quantity_flat, input_key, quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
) t
WHERE (
    (lower(pb.name) LIKE '%door%' AND lower(pb.name) LIKE '%install%')
    OR lower(pb.name) LIKE '%interior door%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM price_book_material_templates x
    WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(t.material_name)
  );

INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, t.material_name, t.quantity_type, t.quantity_flat, t.input_key,
       t.quantity_multiplier, t.waste_factor, t.role, t.unit_label, t.store_section, t.sort_order
FROM price_book pb
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Drywall sheet 1/2" 4×8', 'per_input', NULL::numeric, 'drywall_sqft', 0.03125, 1.10, 'must_buy', 'sheet', 'Building Materials', 10),
    ('Joint compound all-purpose (gallon)', 'static', 1::numeric, NULL::text, NULL::numeric, 1.0, 'must_buy', 'gal', 'Paint', 20),
    ('Drywall mesh tape (roll)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'roll', 'Paint', 30),
    ('Drywall screws 1-5/8" (1 lb)', 'static', 1, NULL, NULL, 1.0, 'consumable', 'box', 'Fasteners', 40),
    ('Spot primer spray', 'static', 1, NULL, NULL, 1.0, 'optional', 'can', 'Paint', 50)
  ) AS x(material_name, quantity_type, quantity_flat, input_key, quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
) t
WHERE (lower(pb.name) LIKE '%drywall%' OR lower(pb.name) LIKE '%patch%')
  AND NOT EXISTS (
    SELECT 1 FROM price_book_material_templates x
    WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(t.material_name)
  );
