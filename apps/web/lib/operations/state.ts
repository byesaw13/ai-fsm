import type { PoolClient } from "pg";
import type { BusinessDayStatus } from "@ai-fsm/domain";
import { businessToday, getBusinessDay } from "./business-day";

/**
 * Current Operations State (TASK-056, Operations Engine Phase 3 slice 2).
 *
 * The live "now": always-known operational state, DERIVED from the open lifecycle
 * rows (no new table). It is what makes one-tap automation cheap — given the
 * current state, a GPS arrival or a tap needs no searching. Read-only: this never
 * locks or mutates (unlike the clock-in helper's FOR UPDATE).
 */

export interface CurrentOperationsState {
  /** The day container (today), if opened. */
  business_day: { id: string; status: BusinessDayStatus } | null;
  /** Payroll: is the person working right now? */
  clocked_in: boolean;
  clock: { id: string; clock_in_at: string } | null;
  /** What they're doing: the verb (activity_type) + the assignment it attaches to. */
  activity: {
    id: string;
    activity_type: string;
    entity_type: string | null;
    entity_id: string | null;
    assignment_kind: string | null;
    labor_bucket: string | null;
    started_at: string;
  } | null;
  /** How they're travelling: the open (unclosed) mileage session, if any. */
  vehicle_session: { id: string; vehicle_id: string | null; started_at: string | null } | null;
  // presence: reserved for Phase 4 (presence_intervals not built yet).
}

export async function getCurrentOperationsState(
  client: PoolClient,
  accountId: string,
  userId: string,
): Promise<CurrentOperationsState> {
  // Sequential — a single pg client processes one query at a time.
  const day = await getBusinessDay(client, accountId, userId, businessToday());

  const clockRes = await client.query<{ id: string; clock_in_at: string }>(
    `SELECT id, clock_in_at::text AS clock_in_at
       FROM time_clock_sessions
      WHERE account_id = $1 AND user_id = $2 AND status = 'open' AND voided_at IS NULL
      LIMIT 1`,
    [accountId, userId],
  );
  const clock = clockRes.rows[0] ?? null;

  const activityRes = await client.query<NonNullable<CurrentOperationsState["activity"]>>(
    `SELECT id, activity_type, entity_type, entity_id, assignment_kind, labor_bucket,
            started_at::text AS started_at
       FROM activity_entries
      WHERE account_id = $1 AND ended_at IS NULL AND voided_at IS NULL
      LIMIT 1`,
    [accountId],
  );

  const vehicleRes = await client.query<NonNullable<CurrentOperationsState["vehicle_session"]>>(
    `SELECT id, vehicle_id, started_at::text AS started_at
       FROM vehicle_sessions
      WHERE account_id = $1 AND end_odometer IS NULL AND miles IS NULL
      ORDER BY started_at DESC NULLS LAST
      LIMIT 1`,
    [accountId],
  );

  return {
    business_day: day ? { id: day.id, status: day.status } : null,
    clocked_in: !!clock,
    clock,
    activity: activityRes.rows[0] ?? null,
    vehicle_session: vehicleRes.rows[0] ?? null,
  };
}
