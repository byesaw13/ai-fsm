import type { PoolClient } from "pg";
import type { MilesSource } from "@ai-fsm/domain";
import { isGpsEstimateSource } from "@ai-fsm/domain";
import { completedSessionMiles, type SessionMiles } from "./sessions";

/** Miles match GPS pre-fill within one decimal place (segment rounds to 0.1 mi). */
export const GPS_MILES_TOLERANCE = 0.15;

export function inferTripMilesSource(opts: {
  segmentVehicleId: string | null;
  estimatedMiles: number | null;
  submittedMiles: number;
}): MilesSource {
  const { segmentVehicleId, estimatedMiles, submittedMiles } = opts;
  if (
    estimatedMiles != null &&
    Math.abs(submittedMiles - estimatedMiles) <= GPS_MILES_TOLERANCE
  ) {
    return segmentVehicleId ? "bt_gps_estimate" : "gps_estimate";
  }
  return "manual_miles";
}

export type GpsSessionToVoid = SessionMiles & {
  id: string;
  miles_source: MilesSource | null;
};

/**
 * Void GPS-estimate trip sessions superseded by an odometer close on the same
 * day. Odometer wins; voided rows stay for audit (OPERATIONS.md).
 */
export async function voidEnclosedGpsEstimates(
  client: PoolClient,
  accountId: string,
  sessionDate: string,
  odometerSessionId: string,
  vehicleId: string | null,
  interval: { startedAt: string; endedAt: string },
): Promise<{ voidedIds: string[]; voidedMiles: number }> {
  const { rows } = await client.query<GpsSessionToVoid>(
    `SELECT id, miles, start_odometer, end_odometer, miles_source
       FROM vehicle_sessions
      WHERE account_id = $1
        AND session_date = $2::date
        AND id <> $3
        AND status = 'closed'
        AND miles_source IN ('gps_estimate', 'bt_gps_estimate')
        AND activity_entry_id IS NOT NULL
        AND started_at IS NOT NULL
        AND ended_at IS NOT NULL
        AND started_at >= $5::timestamptz
        AND ended_at <= $6::timestamptz
        AND ($4::uuid IS NULL OR vehicle_id = $4 OR vehicle_id IS NULL)
      FOR UPDATE`,
    [accountId, sessionDate, odometerSessionId, vehicleId, interval.startedAt, interval.endedAt],
  );

  const voidedIds: string[] = [];
  let voidedMiles = 0;
  for (const row of rows) {
    if (!isGpsEstimateSource(row.miles_source)) continue;
    await client.query(
      `UPDATE vehicle_sessions SET status = 'voided', updated_at = now() WHERE id = $1`,
      [row.id],
    );
    voidedIds.push(row.id);
    voidedMiles += completedSessionMiles(row) ?? 0;
  }
  return { voidedIds, voidedMiles: Math.round(voidedMiles * 10) / 10 };
}