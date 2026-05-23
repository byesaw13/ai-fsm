-- Migration 073: Add unique constraint to service_materials (category, material_name)
-- Ensures idempotent re-runs of data migrations using ON CONFLICT DO NOTHING.
-- Deduplicates first (keeping the lowest sort_order row per pair).

DELETE FROM service_materials sm
WHERE id NOT IN (
  SELECT DISTINCT ON (category, material_name) id
  FROM service_materials
  ORDER BY category, material_name, sort_order ASC, id ASC
);

ALTER TABLE service_materials
  ADD CONSTRAINT uq_service_materials_category_name UNIQUE (category, material_name);
