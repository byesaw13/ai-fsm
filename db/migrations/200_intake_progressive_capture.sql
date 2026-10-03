-- TASK-173: staff intake can save before category, preferred date, or address
-- are known. The columns stay. They are filled in later.
ALTER TABLE booking_requests ALTER COLUMN service_category DROP NOT NULL;
ALTER TABLE booking_requests ALTER COLUMN preferred_date DROP NOT NULL;
ALTER TABLE booking_requests ALTER COLUMN address DROP NOT NULL;

-- Rollback: backfill nulls, then
-- ALTER TABLE booking_requests ALTER COLUMN service_category SET NOT NULL;
-- ALTER TABLE booking_requests ALTER COLUMN preferred_date SET NOT NULL;
-- ALTER TABLE booking_requests ALTER COLUMN address SET NOT NULL;
