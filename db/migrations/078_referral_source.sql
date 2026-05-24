-- Track how clients found the business, with realtor name/company for referral leads.
-- referral_source: how they found us (null = not asked / legacy)
-- referral_name: realtor name or company when source is 'realtor'

ALTER TABLE booking_requests
  ADD COLUMN IF NOT EXISTS referral_source TEXT
    CHECK (referral_source IN ('online', 'friend_neighbor', 'realtor', 'repeat', 'other')),
  ADD COLUMN IF NOT EXISTS referral_name   TEXT;
