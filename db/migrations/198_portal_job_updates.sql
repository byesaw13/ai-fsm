-- TASK-162: Job Reports. When a job is done the owner publishes a short,
-- no-login report to the customer: chosen photos, what was done, and "keep for
-- your records" items (copied text, e.g. paint colors). Nothing is visible
-- until the owner publishes; withdrawing rotates the share token.
CREATE TABLE portal_job_updates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  job_id           uuid NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  property_id      uuid REFERENCES properties(id) ON DELETE SET NULL,
  -- The payer of the job's invoice: who the report goes to.
  client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Payer was a sponsoring realtor (TASK-158): the report carries no records items.
  sponsored        boolean NOT NULL DEFAULT false,
  share_token      uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  title            text NOT NULL,
  summary          text NOT NULL DEFAULT '',
  area             text CHECK (area IN (
                     'interior_paint', 'exterior', 'deck_porch', 'carpentry', 'plumbing',
                     'electrical', 'roof_gutters', 'yard', 'other')),
  work_type        text CHECK (work_type IN ('improvement', 'repair', 'maintenance')),
  media_ids        uuid[] NOT NULL DEFAULT '{}',
  -- [{ "label": "Hall walls", "detail": "BM White Dove OC-17, eggshell" }]
  records          jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(records) = 'array'),
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'withdrawn')),
  published_at     timestamptz,
  first_viewed_at  timestamptz,
  view_count       integer NOT NULL DEFAULT 0,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX portal_job_updates_client_idx ON portal_job_updates (client_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX portal_job_updates_property_idx ON portal_job_updates (property_id)
  WHERE status = 'published';

CREATE TRIGGER trg_portal_job_updates_updated_at
  BEFORE UPDATE ON portal_job_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE portal_job_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_job_updates FORCE ROW LEVEL SECURITY;

CREATE POLICY portal_job_updates_select ON portal_job_updates
  FOR SELECT USING (account_id = app_account_id() AND app_role() IN ('owner','admin'));
CREATE POLICY portal_job_updates_insert ON portal_job_updates
  FOR INSERT WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner','admin'));
CREATE POLICY portal_job_updates_update ON portal_job_updates
  FOR UPDATE USING (account_id = app_account_id() AND app_role() IN ('owner','admin'))
  WITH CHECK (account_id = app_account_id() AND app_role() IN ('owner','admin'));
CREATE POLICY portal_job_updates_delete ON portal_job_updates
  FOR DELETE USING (account_id = app_account_id() AND app_role() IN ('owner','admin'));
