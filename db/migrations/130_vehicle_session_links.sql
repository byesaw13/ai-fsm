-- Migration 130: link vehicle_sessions to the business day (and, for later, the
-- travel activity entry). Operations Engine groundwork (TASK-050 / Phase 1-2
-- review item 6).
--
-- A mileage session belongs to a day (the aggregate — ON DELETE SET NULL, the day
-- owns nothing) and will eventually link to its travel activity_entry so a single
-- confirmed drive yields linked mileage + travel time. Additive + reversible; the
-- columns are nullable and unused until the linking code lands.

ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS business_day_id   UUID REFERENCES business_days(id)   ON DELETE SET NULL;
ALTER TABLE vehicle_sessions
  ADD COLUMN IF NOT EXISTS activity_entry_id UUID REFERENCES activity_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_sessions_business_day   ON vehicle_sessions (business_day_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_sessions_activity_entry ON vehicle_sessions (activity_entry_id);
