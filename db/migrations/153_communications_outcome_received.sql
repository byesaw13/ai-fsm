-- Allow inbound SMS to be logged as "received" (not misleading "replied").
-- "replied" remains valid for true two-way exchange records.

ALTER TABLE communications_log
  DROP CONSTRAINT IF EXISTS communications_log_outcome_check;

ALTER TABLE communications_log
  ADD CONSTRAINT communications_log_outcome_check
  CHECK (outcome = ANY (ARRAY[
    'sent'::text,
    'delivered'::text,
    'failed'::text,
    'no_answer'::text,
    'left_voicemail'::text,
    'replied'::text,
    'received'::text
  ]));

COMMENT ON COLUMN communications_log.outcome IS
  'sent/delivered/failed for outbound; received for inbound SMS; replied for conversation turns; phone outcomes: no_answer/left_voicemail';
