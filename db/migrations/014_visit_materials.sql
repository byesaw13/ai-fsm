-- ============================================================
-- 014_visit_materials.sql
-- Adds materials_used text field to visits so techs can record
-- what materials were consumed on site. Feeds into profitability
-- tracking and informs the owner's expense logging.
-- ============================================================

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS materials_used TEXT;
