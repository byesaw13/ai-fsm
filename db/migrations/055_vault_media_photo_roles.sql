ALTER TABLE property_vault_item_media
  ADD COLUMN IF NOT EXISTS photo_role TEXT NOT NULL DEFAULT 'general'
    CHECK (photo_role IN ('before','after','during','inspection','diagram','general')),
  ADD COLUMN IF NOT EXISTS paired_media_id UUID
    REFERENCES property_vault_item_media(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visit_id UUID
    REFERENCES visits(id) ON DELETE SET NULL;

CREATE INDEX idx_vault_media_visit
  ON property_vault_item_media (visit_id)
  WHERE visit_id IS NOT NULL;

CREATE INDEX idx_vault_media_role
  ON property_vault_item_media (vault_item_id, photo_role);
