-- Bind material packs to explicit price_book codes only.
-- 173 name-match seeds attached toilet/door/drywall packs to the wrong tasks
-- (2003 flapper, 7009 toilet-paper holder, 5008 paint touch-up, 1008 storm door).

-- Keep only packs on the allow-listed codes.
DELETE FROM price_book_material_templates t
USING price_book pb
WHERE t.price_book_id = pb.id
  AND pb.code NOT IN ('4010', '4005', '2005', '1007', '1003');

-- 2005 toilet replacement
INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, v.material_name, v.quantity_type, v.quantity_flat, v.input_key,
       v.quantity_multiplier, v.waste_factor, v.role, v.unit_label, v.store_section, v.sort_order
FROM price_book pb
JOIN (
  VALUES
    ('2005'::text, 'Toilet wax ring (reinforced)'::text, 'static'::text, 1::numeric, NULL::text, NULL::numeric, 1.0::numeric, 'must_buy'::text, 'ea'::text, 'Plumbing'::text, 10),
    ('2005', 'Toilet supply line 3/8" × 12"', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'ea', 'Plumbing', 20),
    ('2005', 'Toilet bolt kit', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'set', 'Plumbing', 30),
    ('2005', 'Silicone sealant — white', 'static', 1, NULL, NULL, 1.0, 'optional', 'tube', 'Plumbing', 40)
) AS v(code, material_name, quantity_type, quantity_flat, input_key,
       quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
  ON pb.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM price_book_material_templates x
  WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(v.material_name)
);

-- 1007 door hardware
INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, v.material_name, v.quantity_type, v.quantity_flat, v.input_key,
       v.quantity_multiplier, v.waste_factor, v.role, v.unit_label, v.store_section, v.sort_order
FROM price_book pb
JOIN (
  VALUES
    ('1007'::text, 'Door hinge set (3-pack)'::text, 'static'::text, 1::numeric, NULL::text, NULL::numeric, 1.0::numeric, 'must_buy'::text, 'set'::text, 'Hardware'::text, 10),
    ('1007', 'Passage / privacy knob set', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'set', 'Hardware', 20),
    ('1007', 'Wood shims (pack)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'pack', 'Lumber', 30),
    ('1007', 'Finish nails 2" (box)', 'static', 1, NULL, NULL, 1.0, 'consumable', 'box', 'Fasteners', 40),
    ('1007', 'Wood glue (bottle)', 'static', 1, NULL, NULL, 1.0, 'optional', 'ea', 'Adhesives', 50)
) AS v(code, material_name, quantity_type, quantity_flat, input_key,
       quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
  ON pb.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM price_book_material_templates x
  WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(v.material_name)
);

-- 1003 large drywall patch (sheets only on >12")
INSERT INTO price_book_material_templates (
  price_book_id, material_name, quantity_type, quantity_flat, input_key,
  quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order
)
SELECT pb.id, v.material_name, v.quantity_type, v.quantity_flat, v.input_key,
       v.quantity_multiplier, v.waste_factor, v.role, v.unit_label, v.store_section, v.sort_order
FROM price_book pb
JOIN (
  VALUES
    ('1003'::text, 'Drywall sheet 1/2" 4×8'::text, 'per_input'::text, NULL::numeric, 'drywall_sqft'::text, 0.03125::numeric, 1.10::numeric, 'must_buy'::text, 'sheet'::text, 'Building Materials'::text, 10),
    ('1003', 'Joint compound all-purpose (gallon)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'gal', 'Paint', 20),
    ('1003', 'Drywall mesh tape (roll)', 'static', 1, NULL, NULL, 1.0, 'must_buy', 'roll', 'Paint', 30),
    ('1003', 'Drywall screws 1-5/8" (1 lb)', 'static', 1, NULL, NULL, 1.0, 'consumable', 'box', 'Fasteners', 40),
    ('1003', 'Spot primer spray', 'static', 1, NULL, NULL, 1.0, 'optional', 'can', 'Paint', 50)
) AS v(code, material_name, quantity_type, quantity_flat, input_key,
       quantity_multiplier, waste_factor, role, unit_label, store_section, sort_order)
  ON pb.code = v.code
WHERE NOT EXISTS (
  SELECT 1 FROM price_book_material_templates x
  WHERE x.price_book_id = pb.id AND lower(x.material_name) = lower(v.material_name)
);
