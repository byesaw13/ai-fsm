-- ============================================================
-- 011_visit_checklist.sql
-- Structured room-by-room walkthrough checklist for visits (P10-T1).
--
-- Implements the SOP from Dovetail Home Services Growth & Operations
-- Playbook v1.2 — sections B.5 (Visit Flow), B.9 (Documentation
-- Requirements), 4.2 (Master Health Check Checklist).
--
-- Each visit gets one set of checklist items, seeded automatically
-- on first GET.  Items are scoped to (account_id, visit_id) for
-- multi-tenant isolation.
--
-- disposition NULL means "not yet reviewed" (intentional — items
-- may be legitimately skipped on some property types).
--
-- item_key is a stable slug for deduplication and idempotent seeding;
-- UNIQUE (visit_id, item_key) prevents duplicate seeds.
-- ============================================================

CREATE TABLE IF NOT EXISTS visit_checklist_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visit_id     UUID        NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  section      TEXT        NOT NULL,
  item_key     TEXT        NOT NULL,
  label        TEXT        NOT NULL,
  disposition  TEXT        CHECK (disposition IN ('ok', 'fix_now', 'monitor', 'optional', 'refer')),
  note         TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visit_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_checklist_visit
  ON visit_checklist_items (visit_id);

CREATE INDEX IF NOT EXISTS idx_checklist_account
  ON visit_checklist_items (account_id);

CREATE TRIGGER trg_checklist_updated_at
  BEFORE UPDATE ON visit_checklist_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---- RLS ----
ALTER TABLE visit_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_account_isolation ON visit_checklist_items
  USING (account_id = current_setting('app.current_account_id', true)::UUID);
