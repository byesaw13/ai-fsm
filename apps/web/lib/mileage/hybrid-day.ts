/**
 * Load hybrid mileage for a business day (TASK-091).
 * Odometer vehicle_session = PRIMARY; GPS drive segment sum = corroboration.
 */
import type { PoolClient } from "pg";
import {
  buildHybridMileageDaySummary,
  type HybridMileageDaySummary,
  type MilesSource,
} from "@ai-fsm/domain";
import { query, queryForSession } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth/session";

type SessionRow = {
  id: string;
  vehicle_name: string | null;
  start_odometer: number | null;
  end_odometer: number | null;
  odometer_miles: number | null;
  miles_source: string | null;
};

async function gpsDriveMilesMeters(
  accountId: string,
  date: string,
  client?: PoolClient,
): Promise<number> {
  // Corroboration: non-dismissed drive segments for the day (not only confirmed).
  const sql = `
    SELECT COALESCE(SUM(distance_meters), 0)::float8 AS meters
    FROM location_segments
    WHERE account_id = $1
      AND segment_date = $2::date
      AND kind = 'drive'
      AND status <> 'dismissed'
      AND COALESCE(is_likely_noise, false) = false
  `;
  if (client) {
    const { rows } = await client.query<{ meters: number }>(sql, [accountId, date]);
    return Number(rows[0]?.meters ?? 0);
  }
  const rows = await query<{ meters: number }>(sql, [accountId, date]);
  return Number(rows[0]?.meters ?? 0);
}

export async function loadHybridMileageForDay(
  accountId: string,
  date: string,
  opts?: { userId?: string | null; client?: PoolClient },
): Promise<HybridMileageDaySummary> {
  const userId = opts?.userId ?? null;
  const sessionSql = `
    SELECT vs.id,
           v.nickname AS vehicle_name,
           vs.start_odometer,
           vs.end_odometer,
           COALESCE(vs.miles, (vs.end_odometer - vs.start_odometer)::numeric)::float8 AS odometer_miles,
           vs.miles_source
    FROM vehicle_sessions vs
    LEFT JOIN vehicles v ON v.id = vs.vehicle_id
    WHERE vs.account_id = $1 AND vs.session_date = $2::date
      AND vs.status <> 'voided'
      ${userId ? "AND vs.created_by = $3" : ""}
    ORDER BY vs.started_at DESC NULLS LAST
    LIMIT 1
  `;
  const params = userId ? [accountId, date, userId] : [accountId, date];

  let session: SessionRow | null = null;
  if (opts?.client) {
    const { rows } = await opts.client.query<SessionRow>(sessionSql, params);
    session = rows[0] ?? null;
  } else {
    const rows = await query<SessionRow>(sessionSql, params);
    session = rows[0] ?? null;
  }

  const meters = await gpsDriveMilesMeters(accountId, date, opts?.client);
  const gpsMiles = meters / 1609.34;
  const source = (session?.miles_source as MilesSource | null) ?? null;

  return buildHybridMileageDaySummary({
    vehicleSessionId: session?.id ?? null,
    vehicleName: session?.vehicle_name ?? null,
    startOdometer: session?.start_odometer ?? null,
    endOdometer: session?.end_odometer ?? null,
    primaryMiles: session?.odometer_miles ?? null,
    primarySource: source ?? (session?.odometer_miles != null ? "odometer" : null),
    gpsMiles,
  });
}

/** Session-scoped wrapper for RSC pages. */
export async function loadHybridMileageForSessionDay(
  session: SessionPayload,
  date: string,
): Promise<HybridMileageDaySummary> {
  const userId = session.userId;
  const sessionSql = `
    SELECT vs.id,
           v.nickname AS vehicle_name,
           vs.start_odometer,
           vs.end_odometer,
           COALESCE(vs.miles, (vs.end_odometer - vs.start_odometer)::numeric)::float8 AS odometer_miles,
           vs.miles_source
    FROM vehicle_sessions vs
    LEFT JOIN vehicles v ON v.id = vs.vehicle_id
    WHERE vs.account_id = $1 AND vs.session_date = $2::date
      AND vs.status <> 'voided'
      AND vs.created_by = $3
    ORDER BY vs.started_at DESC NULLS LAST
    LIMIT 1
  `;
  const sessions = await queryForSession<SessionRow>(session, sessionSql, [
    session.accountId,
    date,
    userId,
  ]);
  const row = sessions[0] ?? null;

  const gpsRows = await queryForSession<{ meters: number }>(
    session,
    `SELECT COALESCE(SUM(distance_meters), 0)::float8 AS meters
     FROM location_segments
     WHERE account_id = $1
       AND segment_date = $2::date
       AND kind = 'drive'
       AND status <> 'dismissed'
       AND COALESCE(is_likely_noise, false) = false`,
    [session.accountId, date],
  );
  const gpsMiles = Number(gpsRows[0]?.meters ?? 0) / 1609.34;
  const source = (row?.miles_source as MilesSource | null) ?? null;

  return buildHybridMileageDaySummary({
    vehicleSessionId: row?.id ?? null,
    vehicleName: row?.vehicle_name ?? null,
    startOdometer: row?.start_odometer ?? null,
    endOdometer: row?.end_odometer ?? null,
    primaryMiles: row?.odometer_miles ?? null,
    primarySource: source ?? (row?.odometer_miles != null ? "odometer" : null),
    gpsMiles,
  });
}
