import type { PoolClient } from "pg";
import { openBusinessDay } from "@/lib/operations/business-day";

export function shouldOpenBusinessDay(input: {
  hasVehicleSession: boolean;
  hasClock: boolean;
  hasVisits: boolean;
}): boolean {
  return input.hasVehicleSession || input.hasClock || input.hasVisits;
}

/** If they worked that date (van, clock, or visits) but have no business day, open one so Close Day exists. */
export async function ensureOpenBusinessDayIfWorked(
  client: PoolClient,
  args: { accountId: string; userId: string; date: string },
): Promise<boolean> {
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM business_days
      WHERE account_id = $1 AND user_id = $2 AND business_date = $3::date
      LIMIT 1`,
    [args.accountId, args.userId, args.date],
  );
  if (existing.rows[0]) return false;

  const [sessions, clocks, visits] = await Promise.all([
    client.query<{ ok: number }>(
      `SELECT 1 AS ok FROM vehicle_sessions
        WHERE account_id = $1 AND created_by = $2 AND session_date = $3::date
          AND status <> 'voided'
        LIMIT 1`,
      [args.accountId, args.userId, args.date],
    ),
    client.query<{ ok: number }>(
      `SELECT 1 AS ok FROM time_clock_sessions
        WHERE account_id = $1 AND user_id = $2 AND voided_at IS NULL
          AND clock_in_at::date = $3::date
        LIMIT 1`,
      [args.accountId, args.userId, args.date],
    ),
    client.query<{ ok: number }>(
      `SELECT 1 AS ok FROM visits
        WHERE account_id = $1 AND assigned_user_id = $2
          AND scheduled_start::date = $3::date
          AND status NOT IN ('cancelled')
        LIMIT 1`,
      [args.accountId, args.userId, args.date],
    ),
  ]);

  if (
    !shouldOpenBusinessDay({
      hasVehicleSession: Boolean(sessions.rows[0]),
      hasClock: Boolean(clocks.rows[0]),
      hasVisits: Boolean(visits.rows[0]),
    })
  ) {
    return false;
  }

  await openBusinessDay(client, args.accountId, args.userId, args.date, args.userId);
  return true;
}
