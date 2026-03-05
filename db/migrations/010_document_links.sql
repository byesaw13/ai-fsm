-- ============================================================
-- 010_document_links.sql
-- Paperless-ngx integration: document link records (P9-T1).
--
-- ai-fsm remains the source of truth for business data.
-- This table stores lightweight references from any ai-fsm
-- entity to a document stored in an external Paperless-ngx
-- instance.  If Paperless is unavailable the link row still
-- exists; the UI degrades gracefully.
--
-- entity_type covers the six linkable entity surfaces:
--   expense | job | client | property | invoice | estimate
--
-- paperless_doc_id is an INTEGER because Paperless uses
-- sequential integer primary keys, not UUIDs (ADR-020).
--
-- title and original_filename are cached at link-creation
-- time so the panel can render basic info when Paperless is
-- offline.  They are NOT kept in sync automatically.
-- ============================================================

CREATE TABLE document_links (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  entity_type         TEXT        NOT NULL
                                    CHECK (entity_type IN (
                                      'expense', 'job', 'client',
                                      'property', 'invoice', 'estimate'
                                    )),
  entity_id           UUID        NOT NULL,
  paperless_doc_id    INTEGER     NOT NULL,
  title               TEXT,
  original_filename   TEXT,
  created_by          UUID        NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, entity_type, entity_id, paperless_doc_id)
);

CREATE INDEX ix_document_links_entity
  ON document_links (account_id, entity_type, entity_id);

CREATE INDEX ix_document_links_paperless_doc
  ON document_links (account_id, paperless_doc_id);

-- ---- RLS ----
ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_links_account_isolation ON document_links
  USING (account_id = current_setting('app.current_account_id', true)::UUID);
