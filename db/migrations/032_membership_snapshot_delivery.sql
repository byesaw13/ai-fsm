-- Track when a membership visit summary/snapshot has been sent to the client
-- or explicitly marked as sent before the visit can be completed.

ALTER TABLE visits
  ADD COLUMN IF NOT EXISTS membership_snapshot_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS visits_membership_snapshot_sent_idx
  ON visits(account_id, generated_from_plan_id, membership_snapshot_sent_at)
  WHERE generated_from_plan_id IS NOT NULL;
