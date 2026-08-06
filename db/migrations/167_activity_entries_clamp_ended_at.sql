-- Migration 167: Clamp activity_entries.ended_at so closing a timer can never
-- violate the strict activity_entries_check constraint (ended_at > started_at).
--
-- A timer whose started_at is at/after "now" (web<->db clock skew, a GPS/auto
-- entry, a backfilled segment arrival time, or an edited timestamp) otherwise
-- 500s on close: `SET ended_at = now()` yields ended_at <= started_at, Postgres
-- raises a check violation, and the row stays open — so the field "Leaving
-- site" button (and five sibling closers) keep failing on every press.
--
-- Reconcile the invalid boundary by pulling the bogus started_at BACK to
-- (ended_at - 1 minute) — never by advancing ended_at. Advancing the close
-- would push it into the future: with started_at 5 min ahead, ended_at would
-- land 6 min ahead, leaving a future-dated entry that overlaps the replacement
-- activities/switch inserts at now() and corrupts billable-time data. Pulling
-- started_at back keeps the close at the intended instant, yields a 1-minute
-- entry ending now (matching the app's Math.max(1, …) duration floor), and
-- stays in the past so it never overlaps the next entry.
-- Additive + reversible: drop trigger + function to revert.
--
-- ponytail: this fixes the close path for the whole class in one place. The
-- deeper question — WHY a started_at can ever be >= now (clock skew vs. missing
-- edit validation vs. GPS backfill) — is a separate follow-up, not this fix.

create or replace function activity_entries_clamp_ended_at()
returns trigger language plpgsql as $$
begin
  if new.ended_at is not null and new.ended_at <= new.started_at then
    new.started_at := new.ended_at - interval '1 minute';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_entries_clamp_ended_at on activity_entries;
create trigger trg_activity_entries_clamp_ended_at
  before insert or update on activity_entries
  for each row execute function activity_entries_clamp_ended_at();
