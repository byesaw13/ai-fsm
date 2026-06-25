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

  const { rows } = await client.query<TimeClockRow>(
    `INSERT INTO time_clock_sessions
       (account_id, user_id, business_day_id, status, pay_type, hourly_rate_snapshot_cents, notes, created_by)
     VALUES ($1, $2, $3, 'open', $4, $5, $6, $2)
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
  return { clock: rows[0], alreadyOpen: false };
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
