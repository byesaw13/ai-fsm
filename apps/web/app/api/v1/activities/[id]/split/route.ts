import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, activityCategoryFor } from "@ai-fsm/domain";
import { splitSegments } from "@/lib/activities/timeline";

export const dynamic = "force-dynamic";

// Split one completed block into N contiguous segments that exactly cover the
// original's [started_at, ended_at]. The caller sends the final segment list
// (each with its own type / entity link / note); the original row becomes the
// first segment in place and the rest are inserted, all in one transaction.

const segmentSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  ended_at: z.string().datetime(),
  entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
}).refine((s) => (s.entity_type == null) === (s.entity_id == null), {
  message: "entity_type and entity_id must be provided together",
});

const splitSchema = z.object({
  // Segments in chronological order. The final segment's ended_at must equal the
  // original block's ended_at; each earlier ended_at is an interior boundary.
  segments: z.array(segmentSchema).min(2),
  reason: z.string().max(500).nullable().optional(),
});

function idFromPath(request: NextRequest): string | undefined {
  // .../activities/{id}/split
  return request.nextUrl.pathname.split("/").at(-2);
}

function err(code: string, message: string, status: number, traceId: string) {
  return NextResponse.json({ error: { code, message, traceId } }, { status });
}

type EntryRow = {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  note: string | null;
};

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Activity not found", 404, session.traceId);

  const body = await request.json().catch(() => null);
  const parsed = splitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid split", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }
  const d = parsed.data;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await client.query<EntryRow>(
      `SELECT id, activity_type, started_at::text, ended_at::text, entity_type, entity_id, note
       FROM activity_entries
       WHERE id = $1 AND account_id = $2 AND voided_at IS NULL FOR UPDATE`,
      [id, session.accountId]
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Activity not found", 404, session.traceId);
    }
    if (row.ended_at == null) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Only a completed block can be split", 400, session.traceId);
    }

    // The interior boundaries are every segment's ended_at except the last,
    // which must equal the original block's end. splitSegments validates that
    // the boundaries are strictly increasing and inside the block.
    const last = d.segments[d.segments.length - 1];
    if (new Date(last.ended_at).getTime() !== new Date(row.ended_at).getTime()) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Final segment must end exactly when the original block ends", 400, session.traceId);
    }
    const boundaries = d.segments.slice(0, -1).map((s) => s.ended_at);
    try {
      splitSegments(
        { started_at: row.started_at, ended_at: row.ended_at, activity_type: row.activity_type as (typeof ACTIVITY_TYPES)[number] },
        boundaries,
      );
    } catch (e) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", e instanceof Error ? e.message : "Invalid split boundaries", 400, session.traceId);
    }

    // Segment 1 reshapes the original row; segments 2..N are inserted. Each
    // segment's start is the previous segment's end (or the block start).
    const insertedIds: string[] = [];
    let segStart = row.started_at;
    for (let i = 0; i < d.segments.length; i++) {
      const seg = d.segments[i];
      const category = activityCategoryFor(seg.activity_type);
      if (i === 0) {
        await client.query(
          `UPDATE activity_entries
           SET activity_type = $1, category = $2, ended_at = $3::timestamptz,
               entity_type = $4, entity_id = $5, note = $6
           WHERE id = $7 AND account_id = $8`,
          [seg.activity_type, category, seg.ended_at, seg.entity_type ?? null, seg.entity_id ?? null, seg.note ?? null, id, session.accountId]
        );
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO activity_entries
             (account_id, user_id, session_date, activity_type, category,
              started_at, ended_at, entity_type, entity_id, source, note)
           VALUES ($1, $2, ($3::timestamptz)::date, $4, $5, $3::timestamptz, $6::timestamptz, $7, $8, 'manual', $9)
           RETURNING id`,
          [session.accountId, session.userId, segStart, seg.activity_type, category, seg.ended_at, seg.entity_type ?? null, seg.entity_id ?? null, seg.note ?? null]
        );
        insertedIds.push(ins.rows[0].id);
      }
      segStart = seg.ended_at;
    }

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "activity_entry",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: {
        activity_type: row.activity_type, started_at: row.started_at, ended_at: row.ended_at,
        entity_type: row.entity_type, entity_id: row.entity_id, note: row.note,
      },
      new_value: {
        split_into: d.segments.length,
        inserted_ids: insertedIds,
        reason: d.reason ?? null,
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { id, inserted_ids: insertedIds } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/activities/[id]/split error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to split activity", 500, session.traceId);
  } finally {
    client.release();
  }
});
