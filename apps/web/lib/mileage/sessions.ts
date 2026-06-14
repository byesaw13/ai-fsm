import type { PoolClient } from "pg";

/**
 * Vehicle-session mileage helpers.
 *
 * Vehicle sessions are the source of truth for odometer movement. These helpers
 * enforce that a vehicle's odometer never moves backward outside an explicit
 * correction, and surface suspicious readings for UI warnings.
 *
 * The query helpers expect a transaction `client` that already has the app.*
 * RLS session variables set (vehicle_sessions uses FORCE ROW LEVEL SECURITY).
 */

/** A single completed vehicle session is unlikely to exceed this many miles. */
export const SUSPICIOUS_SESSION_MILES = 500;

export type StartValidation =
  | { ok: true }
  | { ok: false; code: "ODOMETER_TOO_LOW"; lastKnown: number };

/**
 * The highest odometer value ever recorded for a vehicle — the monotonic floor
 * a new start_odometer must meet. Considers both start and end readings so an
 * open session's start still pins the floor.
 */
export async function lastKnownOdometer(
  client: PoolClient,
  accountId: string,
  vehicleId: string,
): Promise<number | null> {
  const { rows } = await client.query<{ last_known: number | null }>(
    `SELECT MAX(GREATEST(start_odometer, COALESCE(end_odometer, start_odometer)))::int AS last_known
       FROM vehicle_sessions
      WHERE account_id = $1 AND vehicle_id = $2`,
    [accountId, vehicleId],
  );
  return rows[0]?.last_known ?? null;
}

export type OpenSessionRow = {
  id: string;
  start_odometer: number | null;
  session_date: string;
};

/** The open/incomplete prior session for a vehicle, if one exists. */
export async function findOpenSessionForVehicle(
  client: PoolClient,
  accountId: string,
  vehicleId: string,
): Promise<OpenSessionRow | null> {
  const { rows } = await client.query<OpenSessionRow>(
    `SELECT id, start_odometer, session_date::text AS session_date
       FROM vehicle_sessions
      WHERE account_id = $1
        AND vehicle_id = $2
        AND end_odometer IS NULL
        AND miles IS NULL
      ORDER BY started_at DESC
      LIMIT 1`,
    [accountId, vehicleId],
  );
  return rows[0] ?? null;
}

/**
 * A proposed start_odometer must be >= the vehicle's last known reading, unless
 * the caller is running an explicit correction flow.
 */
export function validateStartOdometer(
  lastKnown: number | null,
  proposed: number,
  opts: { correction?: boolean } = {},
): StartValidation {
  if (opts.correction) return { ok: true };
  if (lastKnown != null && proposed < lastKnown) {
    return { ok: false, code: "ODOMETER_TOO_LOW", lastKnown };
  }
  return { ok: true };
}

/** True when a session's mileage span looks implausibly large. */
export function isSuspiciousMiles(
  startOdometer: number,
  endOdometer: number,
): boolean {
  return endOdometer - startOdometer > SUSPICIOUS_SESSION_MILES;
}

export type SessionMiles = {
  miles: number | null;
  start_odometer: number | null;
  end_odometer: number | null;
};

/**
 * Miles for one session — the stored `miles`, else the odometer span. Open
 * (incomplete) sessions contribute nothing. This is the single rule for
 * odometer movement: vehicle sessions are the only mileage truth.
 */
export function completedSessionMiles(s: SessionMiles): number | null {
  if (s.miles != null) return s.miles;
  if (s.start_odometer != null && s.end_odometer != null) {
    return s.end_odometer - s.start_odometer;
  }
  return null;
}

/** Daily total = sum of every completed vehicle session that day (all vehicles). */
export function dailyMileageTotal(sessions: SessionMiles[]): number {
  return sessions.reduce((sum, s) => sum + (completedSessionMiles(s) ?? 0), 0);
}
