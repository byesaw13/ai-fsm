import type { PoolClient } from "pg";
import type { PayType } from "@ai-fsm/domain";
import { businessToday, openBusinessDay } from "./business-day";

/**
 * Payroll clock persistence (TASK-052, Operations Engine Phase 2).
 *
 * The clock answers "was this person working?" — independent of the activity
 * timeline. One open clock per user at a time (enforced by the partial unique
 * index). Corrections void + re-add. Run under `withDbSession` (RLS).
 */

export interface TimeClockRow {
  id: string;
  user_id: string;
  business_day_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  status: "open" | "closed";
  pay_type: PayType;
  hourly_rate_snapshot_cents: number | null;
  notes: string | null;
}

const COLS = `id, user_id, business_day_id, clock_in_at::text AS clock_in_at,
  clock_out_at::text AS clock_out_at, status, pay_type,
  hourly_rate_snapshot_cents, notes`;

/** The user's currently-open (non-voided) clock, or null. */
export async function getOpenClock(
  client: PoolClient,
  accountId: string,
  userId: string,
): Promise<TimeClockRow | null> {
  const { rows } = await client.query<TimeClockRow>(
    `SELECT ${COLS} FROM time_clock_sessions
      WHERE account_id = $1 AND user_id = $2 AND status = 'open' AND voided_at IS NULL
      FOR UPDATE`,
    [accountId, userId],
  );
  return rows[0] ?? null;
}

export interface ClockInOpts {
  payType?: PayType;
  hourlyRateSnapshotCents?: number | null;
  notes?: string | null;
}

/**
 * Clock in. Idempotent: if a clock is already open, returns it unchanged.
 * Clocking in opens today's business day (the container) and links to it — the
 * day is an aggregate, so this only ensures the container exists.
 */
export async function clockIn(
  client: PoolClient,
  accountId: string,
  userId: string,
  opts: ClockInOpts = {},
): Promise<{ clock: TimeClockRow; alreadyOpen: boolean }> {
  const existing = await getOpenClock(client, accountId, userId);
  if (existing) return { clock: existing, alreadyOpen: true };

  const day = await openBusinessDay(client, accountId, userId, businessToday(), userId);

  // FOR UPDATE above locks nothing when no open clock exists, so two concurrent
  // clock-ins (double-tap / retry) both reach here. ON CONFLICT against the
  // one-open-clock partial unique index makes the loser a no-op (rather than a
  // 23505 → 500); we then re-read and return the winner's clock idempotently.
  const { rows } = await client.query<TimeClockRow>(
    `INSERT INTO time_clock_sessions
       (account_id, user_id, business_day_id, status, pay_type, hourly_rate_snapshot_cents, notes, created_by)
     VALUES ($1, $2, $3, 'open', $4, $5, $6, $2)
     ON CONFLICT (account_id, user_id) WHERE status = 'open' AND voided_at IS NULL DO NOTHING
     RETURNING ${COLS}`,
    [
      accountId,
      userId,
      day.id,
      opts.payType ?? "hourly",
      opts.hourlyRateSnapshotCents ?? null,
      opts.notes ?? null,
    ],
  );
  if (rows[0]) return { clock: rows[0], alreadyOpen: false };

  // Lost the race: another request opened the clock first — return it.
  const raced = await getOpenClock(client, accountId, userId);
  if (raced) return { clock: raced, alreadyOpen: true };
  throw new Error("clockIn: conflict but no open clock found");
}

/**
 * The user's non-voided clock sessions worth correcting: any still-open session
 * (e.g. a forgot-to-clock-out from yesterday) plus everything from today.
 * Newest first.
 */
export async function listTodayClocks(
  client: PoolClient,
  accountId: string,
  userId: string,
): Promise<TimeClockRow[]> {
  const { rows } = await client.query<TimeClockRow>(
    `SELECT ${COLS} FROM time_clock_sessions
      WHERE account_id = $1 AND user_id = $2 AND voided_at IS NULL
        AND (status = 'open' OR clock_in_at >= date_trunc('day', now()))
      ORDER BY clock_in_at DESC`,
    [accountId, userId],
  );
  return rows;
}

/**
 * Void a clock session (never delete — payroll is financial history). Records
 * the reason. Returns null if the session isn't found / already voided (RLS
 * scopes to the account; the update policy limits techs to their own rows).
 */
export async function voidClock(
  client: PoolClient,
  accountId: string,
  sessionId: string,
  reason: string,
): Promise<TimeClockRow | null> {
  const { rows } = await client.query<TimeClockRow>(
    `UPDATE time_clock_sessions
        SET voided_at = now(), correction_reason = $3
      WHERE id = $1 AND account_id = $2 AND voided_at IS NULL
      RETURNING ${COLS}`,
    [sessionId, accountId, reason],
  );
  return rows[0] ?? null;
}

/**
 * Correct a clock session by voiding it and re-adding a corrected one (AC:
 * "corrections void + re-add, never delete"). Both happen in the caller's tx.
 * The new row keeps the original's user/day/pay fields. Pass `clockOutAt = null`
 * to leave the corrected session open. Returns the new row, or null if the
 * original wasn't found / already voided.
 */
export async function correctClock(
  client: PoolClient,
  accountId: string,
  sessionId: string,
  actorId: string,
  input: { clockInAt: string; clockOutAt: string | null; reason: string },
): Promise<TimeClockRow | null> {
  const voided = await voidClock(client, accountId, sessionId, input.reason);
  if (!voided) return null;

  const { rows } = await client.query<TimeClockRow>(
    `INSERT INTO time_clock_sessions
       (account_id, user_id, business_day_id, clock_in_at, clock_out_at, status,
        pay_type, hourly_rate_snapshot_cents, notes, created_by)
     SELECT account_id, user_id, business_day_id, $3::timestamptz, $4::timestamptz,
            CASE WHEN $4 IS NULL THEN 'open' ELSE 'closed' END,
            pay_type, hourly_rate_snapshot_cents, notes, $5
       FROM time_clock_sessions WHERE id = $1 AND account_id = $2
     RETURNING ${COLS}`,
    [sessionId, accountId, input.clockInAt, input.clockOutAt, actorId],
  );
  return rows[0] ?? null;
}

/** Clock out the open clock. Returns null if there was nothing open. */
export async function clockOut(
  client: PoolClient,
  accountId: string,
  userId: string,
): Promise<TimeClockRow | null> {
  const open = await getOpenClock(client, accountId, userId);
  if (!open) return null;
  const { rows } = await client.query<TimeClockRow>(
    `UPDATE time_clock_sessions
        SET status = 'closed', clock_out_at = now()
      WHERE id = $1 AND account_id = $2 AND status = 'open'
      RETURNING ${COLS}`,
    [open.id, accountId],
  );
  return rows[0] ?? null;
}
