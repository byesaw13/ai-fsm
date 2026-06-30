import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, activityCategoryFor } from "@ai-fsm/domain";
import { applyRebalance } from "@/lib/activities/rebalance";

export const dynamic = "force-dynamic";

// TASK-024 (slice 2): label or dismiss a captured location segment.
//   confirm → promote the segment into the activity_entries ledger (source
//             'backfill') and link it back; the segment becomes 'confirmed'.
//   dismiss → hide it from the timeline; nothing reaches the ledger.
// Promotion only touches the ledger on explicit owner action — no silent
// guessing (TASK-024 out-of-scope).

function idFromPath(request: NextRequest): string | undefined {
  // .../activities/segments/{id}
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

const dismissSchema = z.object({ action: z.literal("dismiss") });

// log_trip: promote a DRIVE segment into a vehicle mileage session (TASK-025).
const logTripSchema = z.object({
  action: z.literal("log_trip"),
  vehicle_id: z.string().uuid(),
  miles: z.number().positive().max(100000),
  note: z.string().max(500).nullish(),
});

// union (not discriminatedUnion) because confirmSchema carries a .refine().
const bodySchema = z.union([confirmSchema, dismissSchema, logTripSchema]);

type SegRow = {
  id: string;
  kind: "stop" | "drive";
  segment_date: string;
  started_at: string;
  ended_at: string | null;
  place_label: string | null;
  status: string;
  activity_entry_id: string | null;
  vehicle_session_id: string | null;
};

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
              place_label, status, activity_entry_id, vehicle_session_id
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

    if (d.action === "log_trip") {
      // Promote a drive into a mileage session. Owner supplies the vehicle and
      // the (GPS-pre-filled, editable) miles — nothing is written without that.
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
      // Only a provisional drive can be logged (not a dismissed or otherwise
      // already-resolved one) — mirrors the confirm/dismiss guards.
      if (seg.status !== "provisional") {
        await client.query("ROLLBACK");
        return err("CONFLICT", `Drive is ${seg.status}; cannot log mileage.`, 409, session.traceId);
      }
      // The vehicle must belong to this account (RLS also guards the FK).
      const veh = await client.query<{ id: string }>(
        `SELECT id FROM vehicles WHERE id = $1 AND account_id = $2`,
        [d.vehicle_id, session.accountId],
      );
      if (veh.rows.length === 0) {
        await client.query("ROLLBACK");
        return err("VALIDATION_ERROR", "Unknown vehicle", 400, session.traceId);
      }
      const { rows: sess } = await client.query<{ id: string }>(
        `INSERT INTO vehicle_sessions
           (account_id, vehicle_id, session_date, miles, notes, created_by)
         VALUES ($1, $2, $3::date, $4, $5, $6)
         RETURNING id`,
        [
          session.accountId,
          d.vehicle_id,
          seg.segment_date,
          d.miles,
          d.note ?? `Auto-captured drive ${seg.started_at.slice(11, 16)}–${(seg.ended_at ?? "").slice(11, 16)}`,
          session.userId,
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
      return NextResponse.json({ data: { id, status: "confirmed", vehicle_session_id: sessionId } });
    }

    if (d.action === "dismiss") {
      if (seg.status === "dismissed") {
        await client.query("ROLLBACK");
        return NextResponse.json({ data: { id, status: "dismissed", already: true } });
      }
      // Don't dismiss a segment another tab already promoted — that would orphan
      // its ledger row. Make the user undo the entry from the timeline instead.
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

    // confirm — idempotent if already promoted.
    if (seg.status === "confirmed" && seg.activity_entry_id) {
      await client.query("ROLLBACK");
      return NextResponse.json({
        data: { id, status: "confirmed", activity_entry_id: seg.activity_entry_id, already: true },
      });
    }
    // Only a provisional segment can be promoted (e.g. not a dismissed one).
    if (seg.status !== "provisional") {
      await client.query("ROLLBACK");
      return err("CONFLICT", `Segment is ${seg.status}; cannot confirm.`, 409, session.traceId);
    }
    // A segment must have ended before it can become a ledger fact, so it never
    // collides with the live "one active entry" invariant.
    if (seg.ended_at === null) {
      await client.query("ROLLBACK");
      return err("CONFLICT", "Segment is still in progress; label it once it ends.", 409, session.traceId);
    }

    // Refuse to create overlapping ledger time (double-counting). The owner
    // resolves the conflict in the timeline editor or dismisses the segment.
    const { rows: overlap } = await client.query<{ id: string }>(
      `SELECT id FROM activity_entries
       WHERE account_id = $1 AND voided_at IS NULL
         AND started_at < $3 AND COALESCE(ended_at, 'infinity'::timestamptz) > $2
       LIMIT 1`,
      [session.accountId, seg.started_at, seg.ended_at],
    );
    if (overlap.length > 0 && !d.rebalance?.length) {
      await client.query("ROLLBACK");
      return err(
        "CONFLICT",
        "This time range overlaps activity already logged. Adjust it in the timeline or dismiss the segment.",
        409,
        session.traceId,
      );
    }

    const category = activityCategoryFor(d.activity_type);
    const { rows: ins } = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note)
       VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, 'backfill', $10)
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
