-- Migration 024: Add document categories and linking fields to document_links
-- Adds document_type, is_master_template, is_archived, and property_id for better organization

ALTER TABLE document_links ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'other'
  CHECK (document_type IN (
    'estimate_pdf','estimate_docx','invoice_pdf','invoice_docx',
    'receipt','photo','signed_approval','insurance','contract',
    'client_file','sop','template','other'
  ));

ALTER TABLE document_links ADD COLUMN IF NOT EXISTS is_master_template boolean DEFAULT false;
ALTER TABLE document_links ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;
ALTER TABLE document_links ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id) ON DELETE SET NULL;

-- Index for filtering by document type
CREATE INDEX IF NOT EXISTS document_links_type_idx ON document_links(document_type) WHERE document_type != 'other';

-- Index for finding templates
CREATE INDEX IF NOT EXISTS document_links_template_idx ON document_links(is_master_template) WHERE is_master_template = true;
