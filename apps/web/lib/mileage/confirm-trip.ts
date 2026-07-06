import type { PoolClient } from "pg";
import type { ActivityType } from "@ai-fsm/domain";
import { activityCategoryFor } from "@ai-fsm/domain";
import { inferTripMilesSource } from "./linking";

export type DriveSegmentRow = {
  id: string;
  kind: "stop" | "drive";
  segment_date: string;
  started_at: string;
  ended_at: string;
  place_label: string | null;
  status: string;
  activity_entry_id: string | null;
  vehicle_session_id: string | null;
  vehicle_id: string | null;
  distance_meters: number | null;
};

export type ConfirmTripResult = {
  activity_entry_id: string;
  vehicle_session_id: string;
  miles_source: ReturnType<typeof inferTripMilesSource>;
  already: boolean;
};

/**
 * Atomically promote a drive segment into linked travel time + mileage.
 * Idempotent when both FKs are already stamped on the segment.
 */
export async function confirmDriveTrip(
  client: PoolClient,
  opts: {
    accountId: string;
    userId: string;
    segment: DriveSegmentRow;
    vehicleId: string;
    miles: number;
    activityType: ActivityType;
    entityType: string | null;
    entityId: string | null;
    note: string | null;
    estimatedMiles: number | null;
  },
): Promise<ConfirmTripResult> {
  const { segment } = opts;
  if (segment.activity_entry_id && segment.vehicle_session_id) {
    return {
      activity_entry_id: segment.activity_entry_id,
      vehicle_session_id: segment.vehicle_session_id,
      miles_source: inferTripMilesSource({
        segmentVehicleId: segment.vehicle_id,
        estimatedMiles: opts.estimatedMiles,
        submittedMiles: opts.miles,
      }),
      already: true,
    };
  }

  const milesSource = inferTripMilesSource({
    segmentVehicleId: segment.vehicle_id,
    estimatedMiles: opts.estimatedMiles,
    submittedMiles: opts.miles,
  });

  const dayRes = await client.query<{ id: string }>(
    `SELECT id FROM business_days
      WHERE account_id = $1 AND user_id = $2 AND business_date = $3::date LIMIT 1`,
    [opts.accountId, opts.userId, segment.segment_date],
  );
  const businessDayId = dayRes.rows[0]?.id ?? null;

  let entryId = segment.activity_entry_id;
  if (!entryId) {
    const category = activityCategoryFor(opts.activityType);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note,
          business_day_id, assignment_kind)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, 'backfill', $10, $11, 'none')
       RETURNING id`,
      [
        opts.accountId,
        opts.userId,
        segment.segment_date,
        opts.activityType,
        category,
        segment.started_at,
        segment.ended_at,
        opts.entityType,
        opts.entityId,
        opts.note,
        businessDayId,
      ],
    );
    entryId = rows[0].id;
  }

  let sessionId = segment.vehicle_session_id;
  if (!sessionId) {
    const note =
      opts.note ??
      `Auto-captured drive ${segment.started_at.slice(11, 16)}–${segment.ended_at.slice(11, 16)}`;
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO vehicle_sessions
         (account_id, vehicle_id, session_date, miles, notes, created_by,
          started_at, ended_at, business_day_id, activity_entry_id, miles_source, status)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, 'closed')
       RETURNING id`,
      [
        opts.accountId,
        opts.vehicleId,
        segment.segment_date,
        opts.miles,
        note,
        opts.userId,
        segment.started_at,
        segment.ended_at,
        businessDayId,
        entryId,
        milesSource,
      ],
    );
    sessionId = rows[0].id;
  } else if (entryId) {
    await client.query(
      `UPDATE vehicle_sessions
          SET activity_entry_id = COALESCE(activity_entry_id, $1),
              business_day_id = COALESCE(business_day_id, $2),
              miles_source = COALESCE(miles_source, $3),
              updated_at = now()
        WHERE id = $4 AND account_id = $5`,
      [entryId, businessDayId, milesSource, sessionId, opts.accountId],
    );
  }

  await client.query(
    `UPDATE location_segments
        SET status = 'confirmed',
            activity_entry_id = $1,
            vehicle_id = $2,
            vehicle_session_id = $3,
            suggested_activity_type = $4,
            updated_at = now()
      WHERE id = $5 AND account_id = $6`,
    [entryId, opts.vehicleId, sessionId, opts.activityType, segment.id, opts.accountId],
  );

  return {
    activity_entry_id: entryId!,
    vehicle_session_id: sessionId!,
    miles_source: milesSource,
    already: false,
  };
}