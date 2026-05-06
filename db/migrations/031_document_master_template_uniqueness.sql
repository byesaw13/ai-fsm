-- Enforce one active master template per account and document category.
-- Archived templates remain available for history, but only one non-archived
-- master can exist for a given document_type.

CREATE UNIQUE INDEX IF NOT EXISTS document_links_one_active_master_template
  ON document_links (account_id, document_type)
  WHERE is_master_template = true
    AND is_archived = false
    AND document_type IS NOT NULL;
