import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, activityCategoryFor } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// Timeline correction for a single completed activity entry. Edits mutate the
// row in place (mirroring the vehicle-session correction precedent) and record
// the before/after in audit_log; an optional `rebalance` trims neighbours in
// the same transaction so the day stays chronological. Delete is a hard delete
// (owner/admin per RLS); the original survives in audit_log.old_value.

const rebalanceSchema = z.array(
  z.object({
    id: z.string().uuid(),
    started_at: z.string().datetime().optional(),
    ended_at: z.string().datetime().optional(),
  })
).optional();

const editSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES).optional(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().optional(),
  entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  rebalance: rebalanceSchema,
}).refine(
  (d) => (d.entity_type === undefined) === (d.entity_id === undefined),
  { message: "entity_type and entity_id must be edited together" }
).refine(
  (d) => d.entity_type == null || d.entity_id != null,
  { message: "entity_type and entity_id must be provided together" }
);

function idFromPath(request: NextRequest): string | undefined {
  // .../activities/{id}
  return request.nextUrl.pathname.split("/").at(-1);
}

function err(code: string, message: string, status: number, traceId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, traceId, ...(extra ?? {}) } }, { status });
}

type EntryRow = {
  id: string;
  activity_type: string;
  category: string;
  started_at: string;
  ended_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  note: string | null;
};

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Activity not found", 404, session.traceId);

  const body = await request.json().catch(() => null);
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid edit", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
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
      `SELECT id, activity_type, category, started_at::text, ended_at::text,
              entity_type, entity_id, note
       FROM activity_entries
       WHERE id = $1 AND account_id = $2 AND voided_at IS NULL FOR UPDATE`,
      [id, session.accountId]
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Activity not found", 404, session.traceId);
    }

    const newStart = d.started_at ?? row.started_at;
    const newEnd = d.ended_at ?? row.ended_at;
    if (newEnd == null) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Timeline edits require a completed block (set an end time)", 400, session.traceId);
    }
    if (new Date(newEnd) <= new Date(newStart)) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "End must be after start", 400, session.traceId);
    }
    if (new Date(newEnd).getTime() > Date.now() + 60_000) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Cannot log future time", 400, session.traceId);
    }

    const newType = (d.activity_type ?? row.activity_type) as (typeof ACTIVITY_TYPES)[number];
    const newCategory = activityCategoryFor(newType);
    const newEntityType = d.entity_type === undefined ? row.entity_type : d.entity_type;
    const newEntityId = d.entity_id === undefined ? row.entity_id : d.entity_id;
    const newNote = d.note === undefined ? row.note : d.note;

    const updated = await client.query<EntryRow>(
      `UPDATE activity_entries
       SET activity_type = $1, category = $2,
           started_at = $3::timestamptz, ended_at = $4::timestamptz,
           session_date = ($3::timestamptz)::date,
           entity_type = $5, entity_id = $6, note = $7
       WHERE id = $8 AND account_id = $9
       RETURNING id, activity_type, category, started_at::text, ended_at::text,
                 entity_type, entity_id, note`,
      [newType, newCategory, newStart, newEnd, newEntityType, newEntityId, newNote, id, session.accountId]
    );

    // Apply optional neighbour rebalancing in the same transaction.
    for (const adj of d.rebalance ?? []) {
      if (adj.id === id) continue;
      await client.query(
        `UPDATE activity_entries
         SET started_at = COALESCE($1::timestamptz, started_at),
             ended_at   = COALESCE($2::timestamptz, ended_at)
         WHERE id = $3 AND account_id = $4 AND ended_at IS NOT NULL AND voided_at IS NULL`,
        [adj.started_at ?? null, adj.ended_at ?? null, adj.id, session.accountId]
      );
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
        activity_type: newType, started_at: newStart, ended_at: newEnd,
        entity_type: newEntityType, entity_id: newEntityId, note: newNote,
        reason: d.reason ?? null,
        rebalanced: (d.rebalance ?? []).map((a) => a.id),
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: updated.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/activities/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to edit activity", 500, session.traceId);
  } finally {
    client.release();
  }
});

const deleteSchema = z.object({ reason: z.string().max(500).nullable().optional() });

export const DELETE = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = idFromPath(request);
  if (!id) return err("NOT_FOUND", "Activity not found", 404, session.traceId);

  const body = await request.json().catch(() => ({}));
  const parsed = deleteSchema.safeParse(body ?? {});
  const reason = parsed.success ? parsed.data.reason ?? null : null;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await client.query<EntryRow>(
      `SELECT id, activity_type, category, started_at::text, ended_at::text,
              entity_type, entity_id, note
       FROM activity_entries
       WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [id, session.accountId]
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Activity not found", 404, session.traceId);
    }

    const deleted = await client.query<{ id: string }>(
      `DELETE FROM activity_entries WHERE id = $1 AND account_id = $2 RETURNING id`,
      [id, session.accountId]
    );
    if (!deleted.rows[0]) {
      await client.query("ROLLBACK");
      return err("FORBIDDEN", "Not allowed to delete this activity", 403, session.traceId);
    }

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "activity_entry",
      entity_id: id,
      action: "delete",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: {
        activity_type: row.activity_type, started_at: row.started_at, ended_at: row.ended_at,
        entity_type: row.entity_type, entity_id: row.entity_id, note: row.note,
      },
      new_value: { reason },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { deleted: true, id } });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("DELETE /api/v1/activities/[id] error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to delete activity", 500, session.traceId);
  } finally {
    client.release();
  }
});
