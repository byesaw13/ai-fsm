-- Migration 128: tighten business_days write RLS to the owning user (TASK-051 review).
--
-- Migration 127 allowed any owner/admin/tech in the account to insert/update any
-- business_days row. A business day belongs to a user, so a tech must only write
-- their OWN day; owner/admin may manage any in the account. This is the hard
-- guard behind the route-level ownership check. Reversible: re-create 127's
-- role-only policies.

DROP POLICY IF EXISTS business_days_insert ON business_days;
DROP POLICY IF EXISTS business_days_update ON business_days;

CREATE POLICY business_days_insert ON business_days FOR INSERT WITH CHECK (
  account_id = app_account_id()
  AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));

CREATE POLICY business_days_update ON business_days FOR UPDATE USING (
  account_id = app_account_id()
  AND (app_role() IN ('owner','admin') OR user_id = app_user_id()));
