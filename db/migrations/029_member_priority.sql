-- Add member priority to maintenance plans.
-- Affects routing prioritization and owner visibility.
ALTER TABLE maintenance_plans
  ADD COLUMN member_priority TEXT NOT NULL DEFAULT 'standard'
    CHECK (member_priority IN ('standard', 'priority', 'vip'));
