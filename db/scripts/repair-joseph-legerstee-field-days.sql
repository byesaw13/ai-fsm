-- ============================================================================
-- Repair Joseph Legerstee multi-day field tracking (week of 2026-07-13)
-- ============================================================================
-- Root causes:
--   1) Property coords learned from a bad stop (~15 km from 68 Claremont).
--      With job auto-completed Mon evening, Tue stops scored below the
--      confidence floor (no open_job / recent / near-geofence) → no candidates.
--   2) Calendar visits only existed for Mon + Wed; multi-day T&M needs one
--      visit per work day under the work order.
--   3) Mon main block (5h41m) left as pending candidate; a manual "travel"
--      row covered almost the whole day instead of job_work.
--   4) Tue Claremont stops (29m + 207m) still provisional, never ledgered.
--
-- Operator:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/scripts/repair-joseph-legerstee-field-days.sql
-- ============================================================================

BEGIN;

-- IDs
-- client:   7c1b677c-f6c1-4ddd-9a92-52d8ea13a8e2
-- job:      8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2
-- property: 1eb14e35-d834-4c7c-8dbb-219df9822935
-- wo:       7faecc1b-0032-405d-9632-3dcf007399b9
-- account:  aaaaaaaa-0000-0000-0000-000000000001
-- user:     aaaaaaaa-0000-0000-0000-000000000002
-- mon visit:31fdfdfd-998e-4f49-bd74-8cd63079d1d5
-- wed visit:86aaa8b4-b8f2-4c8d-b78c-b3ab9583153b

-- ----------------------------------------------------------------------------
-- 1) Fix property geofence center from real on-site stops (68 Claremont)
-- ----------------------------------------------------------------------------
UPDATE properties
SET latitude = 42.97173,
    longitude = -71.45661,
    geofence_radius_feet = 400,
    coordinate_source = 'confirmed_visit',
    coordinate_confidence = 'confirmed',
    coordinate_updated_at = now(),
    updated_at = now()
WHERE id = '1eb14e35-d834-4c7c-8dbb-219df9822935';

-- ----------------------------------------------------------------------------
-- 2) Create missing calendar visits (Tue 7/14, Thu 7/16)
-- ----------------------------------------------------------------------------
INSERT INTO visits (
  id, account_id, job_id, work_order_id, assigned_user_id,
  visit_type, status,
  scheduled_start, scheduled_end, arrived_at, completed_at
) VALUES
(
  'b14d0714-0000-4000-8000-000000000014',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2',
  '7faecc1b-0032-405d-9632-3dcf007399b9',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'standard', 'completed',
  '2026-07-14 12:00:00+00',  -- 08:00 ET
  '2026-07-14 20:00:00+00',  -- 16:00 ET
  '2026-07-14 13:33:39+00',  -- first Claremont stop
  '2026-07-14 18:36:11+00'   -- last Claremont departure
),
(
  'b14d0716-0000-4000-8000-000000000016',
  'aaaaaaaa-0000-0000-0000-000000000001',
  '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2',
  '7faecc1b-0032-405d-9632-3dcf007399b9',
  'aaaaaaaa-0000-0000-0000-000000000002',
  'standard', 'completed',
  '2026-07-16 12:00:00+00',  -- 08:00 ET
  '2026-07-16 20:00:00+00',  -- 16:00 ET
  '2026-07-16 12:56:21+00',  -- first job_work stop
  '2026-07-16 20:16:58+00'   -- last Claremont departure
)
ON CONFLICT (id) DO NOTHING;

-- Correct Mon arrival (was recorded only at complete-time ~3:25pm)
UPDATE visits
SET arrived_at = '2026-07-13 13:43:00+00',  -- ~09:43 ET main block start
    updated_at = now()
WHERE id = '31fdfdfd-998e-4f49-bd74-8cd63079d1d5'
  AND arrived_at > scheduled_start + interval '4 hours';

-- ----------------------------------------------------------------------------
-- 3) Mon: reclassify the bogus all-day "travel" into job_work for the main block
-- ----------------------------------------------------------------------------
-- Existing travel 09:20–15:25 ET swallowed the real on-site window.
UPDATE activity_entries
SET ended_at = '2026-07-13 13:43:00+00'  -- 09:43 ET
WHERE id = '797ec7d7-98d6-4417-99ce-2fec54a13f3c'
  AND activity_type = 'travel'
  AND ended_at > '2026-07-13 13:43:00+00';

-- Confirm the 341-minute pending candidate as job_work on the Mon visit
INSERT INTO activity_entries (
  id, account_id, user_id, session_date, activity_type, category,
  started_at, ended_at, entity_type, entity_id, source, note
) VALUES (
  'a13f0341-0000-4000-8000-000000000341',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  '2026-07-13',
  'job_work', 'revenue',
  '2026-07-13 13:43:00+00',
  '2026-07-13 19:23:44+00',
  'visit', '31fdfdfd-998e-4f49-bd74-8cd63079d1d5',
  'backfill',
  'Repaired: confirmed Mon main on-site block (was pending candidate + miscategorized travel)'
)
ON CONFLICT (id) DO NOTHING;

UPDATE visit_candidates
SET status = 'confirmed',
    classification = 'job_work',
    activity_entry_id = 'a13f0341-0000-4000-8000-000000000341',
    updated_at = now()
WHERE id = 'aa8fae4c-3919-4cc3-ada3-bec0769da1b7'
  AND status = 'pending';

-- Noise zero-minute pending
UPDATE visit_candidates
SET status = 'ignored', classification = 'ignore', updated_at = now()
WHERE id = '75edc0b9-07c0-4224-ae07-b441b357323a'
  AND status = 'pending';

-- Overnight "Home" stop wrongly matched to Joseph (~12.5h)
UPDATE visit_candidates
SET status = 'ignored', classification = 'ignore', updated_at = now()
WHERE id = '06823b05-1549-4bc2-ba64-3710ee533534'
  AND status = 'pending';

-- ----------------------------------------------------------------------------
-- 4) Tue: ledger the two Claremont provisional stops + confirm segments
-- ----------------------------------------------------------------------------
INSERT INTO activity_entries (
  id, account_id, user_id, session_date, activity_type, category,
  started_at, ended_at, entity_type, entity_id, source, note
) VALUES
(
  'a14f0029-0000-4000-8000-000000000029',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  '2026-07-14',
  'job_work', 'revenue',
  '2026-07-14 13:33:39+00',
  '2026-07-14 14:02:41+00',
  'visit', 'b14d0714-0000-4000-8000-000000000014',
  'backfill',
  'Repaired: Tue morning Claremont stop (location provisional, no candidate)'
),
(
  'a14f0207-0000-4000-8000-000000000207',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002',
  '2026-07-14',
  'job_work', 'revenue',
  '2026-07-14 15:09:03+00',
  '2026-07-14 18:36:11+00',
  'visit', 'b14d0714-0000-4000-8000-000000000014',
  'backfill',
  'Repaired: Tue main Claremont block (location provisional, no candidate)'
)
ON CONFLICT (id) DO NOTHING;

UPDATE location_segments
SET status = 'confirmed',
    activity_entry_id = 'a14f0029-0000-4000-8000-000000000029',
    suggested_activity_type = 'job_work',
    updated_at = now()
WHERE id = '0fa38e01-8e79-45ea-a9eb-ee50ee37f9a4'
  AND status = 'provisional';

UPDATE location_segments
SET status = 'confirmed',
    activity_entry_id = 'a14f0207-0000-4000-8000-000000000207',
    suggested_activity_type = 'job_work',
    updated_at = now()
WHERE id = '1dcee24b-0306-4942-8bd5-d51632a32e05'
  AND status = 'provisional';

-- Upsert visit candidates for those segments (audit trail)
INSERT INTO visit_candidates (
  account_id, location_segment_id, property_id, matched_client_id, job_id, visit_id,
  distance_meters, confidence_score, arrival_time, departure_time, duration_minutes,
  status, classification, activity_entry_id, source
) VALUES
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  '0fa38e01-8e79-45ea-a9eb-ee50ee37f9a4',
  '1eb14e35-d834-4c7c-8dbb-219df9822935',
  '7c1b677c-f6c1-4ddd-9a92-52d8ea13a8e2',
  '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2',
  'b14d0714-0000-4000-8000-000000000014',
  0, 100,
  '2026-07-14 13:33:39+00', '2026-07-14 14:02:41+00', 29,
  'confirmed', 'job_work', 'a14f0029-0000-4000-8000-000000000029', 'manual'
),
(
  'aaaaaaaa-0000-0000-0000-000000000001',
  '1dcee24b-0306-4942-8bd5-d51632a32e05',
  '1eb14e35-d834-4c7c-8dbb-219df9822935',
  '7c1b677c-f6c1-4ddd-9a92-52d8ea13a8e2',
  '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2',
  'b14d0714-0000-4000-8000-000000000014',
  0, 100,
  '2026-07-14 15:09:03+00', '2026-07-14 18:36:11+00', 207,
  'confirmed', 'job_work', 'a14f0207-0000-4000-8000-000000000207', 'manual'
)
ON CONFLICT (location_segment_id) DO UPDATE SET
  status = 'confirmed',
  classification = 'job_work',
  visit_id = EXCLUDED.visit_id,
  job_id = EXCLUDED.job_id,
  activity_entry_id = EXCLUDED.activity_entry_id,
  updated_at = now();

-- Point the existing 30m manual Tue entry at the new visit when still on job
UPDATE activity_entries
SET entity_type = 'visit',
    entity_id = 'b14d0714-0000-4000-8000-000000000014',
    note = COALESCE(note, '') || CASE WHEN note IS NULL OR note = '' THEN '' ELSE ' | ' END
      || 'Linked to repaired Tue field visit'
WHERE id = '35f4c4f6-2e27-4a0e-82f1-8c904f5d96f2'
  AND entity_type = 'job'
  AND entity_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2';

-- ----------------------------------------------------------------------------
-- 5) Thu: link existing ledger job_work rows to the new visit
-- ----------------------------------------------------------------------------
UPDATE activity_entries
SET entity_type = 'visit',
    entity_id = 'b14d0716-0000-4000-8000-000000000016'
WHERE session_date = '2026-07-16'
  AND entity_type = 'job'
  AND entity_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
  AND voided_at IS NULL;

UPDATE visit_candidates
SET visit_id = 'b14d0716-0000-4000-8000-000000000016',
    updated_at = now()
WHERE arrival_time::date = '2026-07-16'
  AND job_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
  AND visit_id IS NULL;

-- Wed candidates also lacked visit_id
UPDATE visit_candidates
SET visit_id = '86aaa8b4-b8f2-4c8d-b78c-b3ab9583153b',
    updated_at = now()
WHERE arrival_time::date = '2026-07-15'
  AND job_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
  AND visit_id IS NULL;

COMMIT;

-- ----------------------------------------------------------------------------
-- Verify
-- ----------------------------------------------------------------------------
SELECT v.scheduled_start AT TIME ZONE 'America/New_York' AS day_et,
       v.status, v.visit_type
FROM visits v
WHERE v.job_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
  AND v.visit_type = 'standard'
ORDER BY v.scheduled_start;

SELECT session_date, activity_type,
       ROUND(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))/60))::int AS minutes
FROM activity_entries
WHERE voided_at IS NULL
  AND (
    entity_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2'
    OR entity_id IN (SELECT id FROM visits WHERE job_id = '8a76a1ad-ee2b-4564-8d7e-cd922e33f8c2')
  )
GROUP BY session_date, activity_type
ORDER BY session_date, activity_type;

SELECT address, latitude, longitude, geofence_radius_feet
FROM properties WHERE id = '1eb14e35-d834-4c7c-8dbb-219df9822935';
