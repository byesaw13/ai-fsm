-- 102_client_360_indexes.sql
-- Indexes needed by the Client 360 property-enrichment correlated subqueries.
-- The properties card runs two subqueries per property:
--   (1) open job count: WHERE jobs.property_id = p.id AND account_id = ...
--   (2) last service date: WHERE jobs.property_id = p.id (via visit JOIN)
-- Without a property_id index, both degrade to an account-wide jobs scan.
-- Safe to re-run (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_jobs_property ON jobs(property_id)
  WHERE property_id IS NOT NULL;
