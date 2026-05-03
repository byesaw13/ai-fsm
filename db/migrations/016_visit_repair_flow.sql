-- Migration 016: Visit repair flow — media, parts, and issue description

-- visit_media: stores before/after/receipt images per visit
CREATE TABLE visit_media (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID         NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  visit_id      UUID         NOT NULL REFERENCES visits(id)   ON DELETE CASCADE,
  category      TEXT         NOT NULL CHECK (category IN ('before', 'after', 'receipt')),
  filename      TEXT         NOT NULL,
  original_name TEXT         NOT NULL,
  mime_type     TEXT         NOT NULL,
  size_bytes    INTEGER      NOT NULL,
  created_by    UUID         NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_visit_media_visit   ON visit_media(visit_id);
CREATE INDEX idx_visit_media_account ON visit_media(account_id);
ALTER TABLE visit_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY vm_select ON visit_media FOR SELECT USING (account_id = app_account_id());
CREATE POLICY vm_insert ON visit_media FOR INSERT WITH CHECK (account_id = app_account_id());
CREATE POLICY vm_delete ON visit_media FOR DELETE USING (account_id = app_account_id());

-- issue_description: what the tech found when they arrived
ALTER TABLE visits ADD COLUMN issue_description TEXT;

-- visit_parts: structured parts log with cost tracking
CREATE TABLE visit_parts (
  id                   UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID           NOT NULL REFERENCES accounts(id)   ON DELETE CASCADE,
  visit_id             UUID           NOT NULL REFERENCES visits(id)     ON DELETE CASCADE,
  name                 TEXT           NOT NULL,
  quantity             NUMERIC(10,2)  NOT NULL DEFAULT 1,
  actual_cost_cents    INTEGER        NOT NULL,
  customer_price_cents INTEGER        NOT NULL,
  receipt_media_id     UUID           REFERENCES visit_media(id) ON DELETE SET NULL,
  created_by           UUID           NOT NULL REFERENCES users(id),
  created_at           TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX idx_visit_parts_visit   ON visit_parts(visit_id);
CREATE INDEX idx_visit_parts_account ON visit_parts(account_id);
ALTER TABLE visit_parts ENABLE ROW LEVEL SECURITY;
CREATE POLICY vp_select ON visit_parts FOR SELECT USING (account_id = app_account_id());
CREATE POLICY vp_insert ON visit_parts FOR INSERT WITH CHECK (account_id = app_account_id());
CREATE POLICY vp_update ON visit_parts FOR UPDATE USING (account_id = app_account_id());
CREATE POLICY vp_delete ON visit_parts FOR DELETE USING (account_id = app_account_id());
CREATE TRIGGER trg_visit_parts_updated_at BEFORE UPDATE ON visit_parts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
