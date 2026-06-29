-- Migration 133: backfill legacy visit_time_logs into activity_entries (TASK-061).
--
-- activity_entries is becoming the single source of truth for time. The visit
-- transition route already DUAL-WRITES a job_work/visit activity entry alongside
-- each visit_time_logs row, so time tracked since the Operations Engine landed is
-- already in activity_entries. This backfills the LEGACY visit_time_logs rows that
-- predate the dual-write, so historical visit time is visible in the new truth
-- before the invoice-labor readers switch over (TASK-062/063).
--
-- Provenance: source = 'backfill' (an existing allowed value, see migration 111)
-- distinguishes these rows from live 'auto_visit' dual-writes — which is what
-- makes the reversal below safe. labor_bucket fills via the BEFORE INSERT trigger
-- from migration 131 (job_work -> billable). business_day_id /
-- time_clock_session_id / assignment_kind stay NULL: legacy rows have no day,
-- clock, or non-entity assignment.
--
-- Idempotent: a closed visit_time_logs row is skipped when a non-voided
-- job_work/visit activity entry with the SAME (visit_id, started_at) already
-- exists. So the live dual-write is never duplicated, distinct visit timers on the
-- same visit (different started_at) each backfill, and re-running this migration
-- inserts nothing.
--
-- Only CLOSED rows (ended_at IS NOT NULL) are backfilled: an open legacy timer
-- would create a second active entry and trip the one-active-per-account unique
-- index (idx_activity_one_active). ended_at > started_at is already guaranteed by
-- visit_time_logs' own CHECK, so every selected row satisfies activity_entries'
-- matching CHECK. visit_id is NOT NULL there, so entity_type/entity_id are always
-- set together (the both-or-neither CHECK holds).

INSERT INTO activity_entries
  (account_id, user_id, session_date, activity_type, category,
   started_at, ended_at, entity_type, entity_id, source, note)
SELECT
  vtl.account_id,
  vtl.user_id,
  vtl.started_at::date,
  'job_work',
  'revenue',
  vtl.started_at,
  vtl.ended_at,
  'visit',
  vtl.visit_id,
  'backfill',
  vtl.notes
FROM visit_time_logs vtl
WHERE vtl.ended_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM activity_entries ae
    WHERE ae.account_id    = vtl.account_id
      AND ae.entity_type   = 'visit'
      AND ae.entity_id     = vtl.visit_id
      AND ae.activity_type = 'job_work'
      AND ae.started_at    = vtl.started_at
      AND ae.voided_at IS NULL
  );

-- Reversal: live dual-writes use source='auto_visit', and 'backfill' is shared
-- with an earlier activity backfill (travel/personal/material_run/…), so the
-- activity_type='job_work' AND entity_type='visit' scope is what makes this delete
-- precise — it removes only the rows THIS migration created, nothing else.
--   DELETE FROM activity_entries
--    WHERE source = 'backfill' AND activity_type = 'job_work' AND entity_type = 'visit';
