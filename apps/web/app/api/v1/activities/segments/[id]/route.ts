import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, activityCategoryFor } from "@ai-fsm/domain";
import { applyRebalance, rebalanceCoversOverlaps } from "@/lib/activities/rebalance";
import { confirmDriveTrip, type DriveSegmentRow } from "@/lib/mileage/confirm-trip";
import { inferTripMilesSource } from "@/lib/mileage/linking";

export const dynamic = "force-dynamic";

// TASK-024 (slice 2): label or dismiss a captured location segment.
// TASK-050: confirm_trip — atomic travel entry + linked mileage session.

function idFromPath(request: NextRequest): string | undefined {
  return request.nextUrl.pathname.split("/").at(-1);
}

function err(code: string, message: string, status: number, traceId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, traceId, ...(extra ?? {}) } }, { status });
}

const rebalanceSchema = z.array(z.object({
  id: z.string().uuid(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  delete: z.boolean().optional(),
})).optional();

const confirmSchema = z
  .object({
    action: z.literal("confirm"),
    activity_type: z.enum(ACTIVITY_TYPES),
    entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullish(),
    entity_id: z.string().uuid().nullish(),
    note: z.string().max(500).nullish(),
    rebalance: rebalanceSchema,
  })
  .refine((d) => (d.entity_type == null) === (d.entity_id == null), {
    message: "entity_type and entity_id must be set together",
  });

const confirmTripSchema = z
  .object({
    action: z.literal("confirm_trip"),
    vehicle_id: z.string().uuid(),
    miles: z.number().positive().max(100000),
    activity_type: z.enum(ACTIVITY_TYPES).optional().default("travel"),
    entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullish(),
    entity_id: z.string().uuid().nullish(),
    note: z.string().max(500).nullish(),
    rebalance: rebalanceSchema,
  })
  .refine((d) => (d.entity_type == null) === (d.entity_id == null), {
    message: "entity_type and entity_id must be set together",
  });

const dismissSchema = z.object({ action: z.literal("dismiss") });

const logTripSchema = z.object({
  action: z.literal("log_trip"),
  vehicle_id: z.string().uuid(),
  miles: z.number().positive().max(100000),
  note: z.string().max(500).nullish(),
});

const bodySchema = z.union([confirmSchema, confirmTripSchema, dismissSchema, logTripSchema]);

type SegRow = DriveSegmentRow;

function estimatedMilesFromSegment(seg: SegRow): number | null {
  if (seg.distance_meters == null) return null;
  return Math.round((seg.distance_meters / 1609.344) * 10) / 10;
}

async function assertNoOverlap(
  client: PoolClient,
  accountId: string,
  startedAt: string,
  endedAt: string,
  rebalance: z.infer<typeof rebalanceSchema>,
  traceId: string,
): Promise<NextResponse | null> {
  const { rows: overlap } = await client.query<{ id: string; started_at: string; ended_at: string | null }>(
    `SELECT id, started_at::text, ended_at::text FROM activity_entries
     WHERE account_id = $1 AND voided_at IS NULL
       AND started_at < $3 AND COALESCE(ended_at, 'infinity'::timestamptz) > $2
     FOR UPDATE`,
    [accountId, startedAt, endedAt],
  );
  if (!rebalanceCoversOverlaps(overlap, rebalance, { started_at: startedAt, ended_at: endedAt })) {
    return err(
      "CONFLICT",
      "This time range overlaps activity already logged. Adjust it in the timeline or dismiss the segment.",
      409,
      traceId,
    );
  }
  return null;
}

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Segment not found", 404, session.traceId);

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return err("VALIDATION_ERROR", "Invalid request", 400, session.traceId, {
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const d = parsed.data;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true),
              set_config('app.current_account_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
    );

    const { rows } = await client.query<SegRow>(
      `SELECT id, kind, segment_date::text, started_at::text, ended_at::text,
              place_label, status, activity_entry_id, vehicle_session_id,
              vehicle_id, distance_meters
       FROM location_segments
       WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [id, session.accountId],
    );
    const seg = rows[0];
    if (!seg) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Segment not found", 404, session.traceId);
    }

    if (d.action === "confirm_trip") {
      if (seg.kind !== "drive") {
        await client.query("ROLLBACK");
        return err("CONFLICT", "Only a drive can be confirmed as a trip.", 409, session.traceId);
      }
      if (seg.ended_at === null) {
        await client.query("ROLLBACK");
        return err("CONFLICT", "Drive is still in progress; confirm once it ends.", 409, session.traceId);
      }
      if (seg.status !== "provisional" && !(seg.activity_entry_id && seg.vehicle_session_id)) {
        await client.query("ROLLBACK");
        return err("CONFLICT", `Drive is ${seg.status}; cannot confirm trip.`, 409, session.traceId);
      }

      const veh = await client.query<{ id: string }>(
        `SELECT id FROM vehicles WHERE id = $1 AND account_id = $2`,
        [d.vehicle_id, session.accountId],
      );
      if (veh.rows.length === 0) {
        await client.query("ROLLBACK");
        return err("VALIDATION_ERROR", "Unknown vehicle", 400, session.traceId);
      }

      if (seg.activity_entry_id && seg.vehicle_session_id) {
        await client.query("ROLLBACK");
        return NextResponse.json({
          data: {
            id,
            status: "confirmed",
            activity_entry_id: seg.activity_entry_id,
            vehicle_session_id: seg.vehicle_session_id,
            miles_source: inferTripMilesSource({
              segmentVehicleId: seg.vehicle_id,
              estimatedMiles: estimatedMilesFromSegment(seg),
              submittedMiles: d.miles,
            }),
            already: true,
          },
        });
      }

      const overlapErr = await assertNoOverlap(
        client,
        session.accountId,
        seg.started_at,
        seg.ended_at,
        d.rebalance,
        session.traceId,
      );
      if (overlapErr) {
        await client.query("ROLLBACK");
        return overlapErr;
      }

      await applyRebalance(
        client,
        { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
        d.rebalance,
      );

      const result = await confirmDriveTrip(client, {
        accountId: session.accountId,
        userId: session.userId,
        segment: seg,
        vehicleId: d.vehicle_id,
        miles: d.miles,
        activityType: d.activity_type,
        entityType: d.entity_type ?? null,
        entityId: d.entity_id ?? null,
        note: d.note ?? null,
        estimatedMiles: estimatedMilesFromSegment(seg),
      });

      await client.query("COMMIT");
      return NextResponse.json({
        data: {
          id,
          status: "confirmed",
          activity_entry_id: result.activity_entry_id,
          vehicle_session_id: result.vehicle_session_id,
          miles_source: result.miles_source,
          already: result.already,
        },
      });
    }

    if (d.action === "log_trip") {
      if (seg.kind !== "drive") {
        await client.query("ROLLBACK");
        return err("CONFLICT", "Only a drive can be logged as mileage.", 409, session.traceId);
      }
      if (seg.ended_at === null) {
        await client.query("ROLLBACK");
        return err("CONFLICT", "Drive is still in progress; log it once it ends.", 409, session.traceId);
      }
      if (seg.vehicle_session_id) {
        await client.query("ROLLBACK");
        return NextResponse.json({
          data: { id, status: "confirmed", vehicle_session_id: seg.vehicle_session_id, already: true },
        });
      }
      if (seg.status !== "provisional") {
        await client.query("ROLLBACK");
        return err("CONFLICT", `Drive is ${seg.status}; cannot log mileage.`, 409, session.traceId);
      }
      const veh = await client.query<{ id: string }>(
        `SELECT id FROM vehicles WHERE id = $1 AND account_id = $2`,
        [d.vehicle_id, session.accountId],
      );
      if (veh.rows.length === 0) {
        await client.query("ROLLBACK");
        return err("VALIDATION_ERROR", "Unknown vehicle", 400, session.traceId);
      }

      const milesSource = inferTripMilesSource({
        segmentVehicleId: seg.vehicle_id,
        estimatedMiles: estimatedMilesFromSegment(seg),
        submittedMiles: d.miles,
      });
      const dayRes = await client.query<{ id: string }>(
        `SELECT id FROM business_days
          WHERE account_id = $1 AND user_id = $2 AND business_date = $3::date LIMIT 1`,
        [session.accountId, session.userId, seg.segment_date],
      );

      const { rows: sess } = await client.query<{ id: string }>(
        `INSERT INTO vehicle_sessions
           (account_id, vehicle_id, session_date, miles, notes, created_by,
            started_at, ended_at, business_day_id, miles_source, status)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, 'closed')
         RETURNING id`,
        [
          session.accountId,
          d.vehicle_id,
          seg.segment_date,
          d.miles,
          d.note ?? `Auto-captured drive ${seg.started_at.slice(11, 16)}–${seg.ended_at.slice(11, 16)}`,
          session.userId,
          seg.started_at,
          seg.ended_at,
          dayRes.rows[0]?.id ?? null,
          milesSource,
        ],
      );
      const sessionId = sess[0].id;
      await client.query(
        `UPDATE location_segments
         SET status = 'confirmed', vehicle_id = $1, vehicle_session_id = $2, updated_at = now()
         WHERE id = $3 AND account_id = $4`,
        [d.vehicle_id, sessionId, id, session.accountId],
      );
      await client.query("COMMIT");
      return NextResponse.json({
        data: { id, status: "confirmed", vehicle_session_id: sessionId, miles_source: milesSource },
      });
    }

    if (d.action === "dismiss") {
      if (seg.status === "dismissed") {
        await client.query("ROLLBACK");
        return NextResponse.json({ data: { id, status: "dismissed", already: true } });
      }
      if (seg.status === "confirmed") {
        await client.query("ROLLBACK");
        return err("CONFLICT", "Segment is already logged; remove the entry from the timeline instead.", 409, session.traceId);
      }
      await client.query(
        `UPDATE location_segments SET status = 'dismissed', updated_at = now()
         WHERE id = $1 AND account_id = $2 AND status = 'provisional'`,
        [id, session.accountId],
      );
      await client.query("COMMIT");
      return NextResponse.json({ data: { id, status: "dismissed" } });
    }

    if (seg.status === "confirmed" && seg.activity_entry_id) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        data: { id, status: "confirmed", activity_entry_id: seg.activity_entry_id, already: true },
      });
    }
    if (seg.status !== "provisional") {
      await client.query("ROLLBACK");
      return err("CONFLICT", `Segment is ${seg.status}; cannot confirm.`, 409, session.traceId);
    }
    if (seg.ended_at === null) {
      await client.query("ROLLBACK");
      return err("CONFLICT", "Segment is still in progress; label it once it ends.", 409, session.traceId);
    }

    const overlapErr = await assertNoOverlap(
      client,
      session.accountId,
      seg.started_at,
      seg.ended_at,
      d.rebalance,
      session.traceId,
    );
    if (overlapErr) {
      await client.query("ROLLBACK");
      return overlapErr;
    }

    const category = activityCategoryFor(d.activity_type);
    const dayRes = await client.query<{ id: string }>(
      `SELECT id FROM business_days
        WHERE account_id = $1 AND user_id = $2 AND business_date = $3::date LIMIT 1`,
      [session.accountId, session.userId, seg.segment_date],
    );
    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note, business_day_id)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, 'backfill', $10, $11)
       RETURNING id`,
      [
        session.accountId,
        session.userId,
        seg.segment_date,
        d.activity_type,
        category,
        seg.started_at,
        seg.ended_at,
        d.entity_type ?? null,
        d.entity_id ?? null,
        d.note ?? null,
        dayRes.rows[0]?.id ?? null,
      ],
    );
    const entryId = ins[0].id;

    await applyRebalance(
      client,
      { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
      d.rebalance,
    );

    await client.query(
      `UPDATE location_segments
       SET status = 'confirmed', activity_entry_id = $1, suggested_activity_type = $2, updated_at = now()
       WHERE id = $3 AND account_id = $4`,
      [entryId, d.activity_type, id, session.accountId],
    );

    await client.query("COMMIT");
    return NextResponse.json({ data: { id, status: "confirmed", activity_entry_id: entryId } });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/v1/activities/segments/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to update segment", 500, session.traceId);
  } finally {
    client.release();
  }
});