-- ============================================================
-- 012_asset_links.sql
-- Homebox integration: asset link records.
--
-- Stores references from ai-fsm jobs/visits to Homebox items.
-- ai-fsm is the source of truth for business data; Homebox is
-- consulted for live item details. If Homebox is unavailable,
-- cached name and location still render in the UI.
--
-- entity_type: job | visit
-- status:      planned | on_site | returned
-- homebox_item_id: UUID string (Homebox item primary key)
-- ============================================================

CREATE TABLE asset_links (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type         TEXT        NOT NULL
                                    CHECK (entity_type IN ('job', 'visit')),
  entity_id           UUID        NOT NULL,
  homebox_item_id     TEXT        NOT NULL,
  cached_name         TEXT,
  cached_location     TEXT,
  status              TEXT        NOT NULL DEFAULT 'planned'
                                    CHECK (status IN ('planned', 'on_site', 'returned')),
  created_by          UUID        NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, entity_type, entity_id, homebox_item_id)
);

CREATE INDEX ix_asset_links_entity
  ON asset_links (account_id, entity_type, entity_id);

-- ---- RLS ----
ALTER TABLE asset_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_links_account_isolation ON asset_links
  USING (account_id = current_setting('app.current_account_id', true)::UUID);
