import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, activityCategoryFor } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// Insert a missing, already-finished activity block between existing records,
// with optional neighbour rebalancing applied atomically so the timeline stays
// consistent. (The simpler /api/v1/activities/log endpoint stays for the
// material-run/backfill callers that never rebalance.)

const insertSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime(),
  entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  rebalance: z.array(
    z.object({
      id: z.string().uuid(),
      started_at: z.string().datetime().optional(),
      ended_at: z.string().datetime().optional(),
    })
  ).optional(),
}).refine((d) => (d.entity_type == null) === (d.entity_id == null), {
  message: "entity_type and entity_id must be provided together",
}).refine((d) => new Date(d.ended_at) > new Date(d.started_at), {
  message: "ended_at must be after started_at",
}).refine((d) => new Date(d.ended_at).getTime() <= Date.now() + 60_000, {
  message: "Cannot log future time",
});

function err(code: string, message: string, status: number, traceId: string) {
  return NextResponse.json({ error: { code, message, traceId } }, { status });
}

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = insertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid activity", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }
  const d = parsed.data;
  const category = activityCategoryFor(d.activity_type);

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const ins = await client.query<{ id: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note)
       VALUES ($1, $2, ($3::timestamptz)::date, $4, $5, $3::timestamptz, $6::timestamptz, $7, $8, 'manual', $9)
       RETURNING id`,
      [session.accountId, session.userId, d.started_at, d.activity_type, category, d.ended_at, d.entity_type ?? null, d.entity_id ?? null, d.note ?? null]
    );
    const newId = ins.rows[0].id;

    for (const adj of d.rebalance ?? []) {
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
      entity_id: newId,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: null,
      new_value: {
        activity_type: d.activity_type, started_at: d.started_at, ended_at: d.ended_at,
        entity_type: d.entity_type ?? null, entity_id: d.entity_id ?? null, note: d.note ?? null,
        reason: d.reason ?? null,
        rebalanced: (d.rebalance ?? []).map((a) => a.id),
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { id: newId } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/activities/insert error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to insert activity", 500, session.traceId);
  } finally {
    client.release();
  }
});
