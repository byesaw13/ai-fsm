-- Migration 101: normalize existing client phone numbers to E.164
--
-- The SMS intake matches clients by exact phone string, so "+1 (555) 123-4567"
-- and "5551234567" fragment one person into two records — and an approval text
-- may then fail to find their estimate. Going forward the app normalizes on
-- write (lib/phone.ts); this backfills existing data to the same shape and adds
-- a lookup index.
--
-- Normalization mirrors lib/phone.ts: 10-digit → +1XXXXXXXXXX, 1+10-digit →
-- +1..., otherwise left untouched (international / already-normalized / unknown
-- formats are not guessed at). A NON-unique index is used: pre-existing
-- duplicate clients are possible and merging them is a separate manual step;
-- a unique index could fail the migration.

UPDATE clients
SET phone =
  CASE
    -- exactly 10 digits → +1XXXXXXXXXX
    WHEN length(regexp_replace(phone, '\D', '', 'g')) = 10
      THEN '+1' || regexp_replace(phone, '\D', '', 'g')
    -- 11 digits starting with 1 → +1XXXXXXXXXX
    WHEN length(regexp_replace(phone, '\D', '', 'g')) = 11
         AND left(regexp_replace(phone, '\D', '', 'g'), 1) = '1'
      THEN '+' || regexp_replace(phone, '\D', '', 'g')
    ELSE phone
  END
WHERE phone IS NOT NULL
  AND phone !~ '^\+1[0-9]{10}$';  -- skip rows already in +1XXXXXXXXXX form

CREATE INDEX IF NOT EXISTS clients_account_phone_idx
  ON clients (account_id, phone)
  WHERE phone IS NOT NULL;
