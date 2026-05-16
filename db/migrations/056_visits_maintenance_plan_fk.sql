ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS maintenance_plan_id UUID
    REFERENCES maintenance_plans(id) ON DELETE SET NULL;

CREATE INDEX idx_visits_maintenance_plan
  ON visits (maintenance_plan_id)
  WHERE maintenance_plan_id IS NOT NULL;
