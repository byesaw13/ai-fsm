-- Migration 019: Maintenance plan execution tracking and automation
-- Adds tracking fields for auto-generating visits from maintenance plans.

-- Add execution tracking to maintenance_plans
ALTER TABLE maintenance_plans
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status TEXT;

-- Index for finding plans due for generation
CREATE INDEX IF NOT EXISTS maintenance_plans_due_idx
  ON maintenance_plans (next_scheduled_date, status)
  WHERE status = 'active' AND next_scheduled_date IS NOT NULL;

-- Add generated_from_plan_id to visits so we can trace auto-created visits back to their plan
ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS generated_from_plan_id UUID REFERENCES maintenance_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS visits_generated_from_plan_idx ON visits(generated_from_plan_id)
  WHERE generated_from_plan_id IS NOT NULL;
