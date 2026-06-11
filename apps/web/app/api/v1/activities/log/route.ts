import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, activityCategoryFor } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const logSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime(),
  entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  source: z.enum(["manual", "auto_material_run", "backfill"]).default("manual"),
}).refine((d) => (d.entity_type == null) === (d.entity_id == null), {
  message: "entity_type and entity_id must be provided together",
}).refine((d) => new Date(d.ended_at) > new Date(d.started_at), {
  message: "ended_at must be after started_at",
}).refine((d) => new Date(d.ended_at).getTime() <= Date.now() + 60_000, {
  message: "Cannot log future time",
});

/**
 * POST /api/v1/activities/log
 *
 * Records an already-finished time segment (does not touch the active
 * activity). Used by the Material Run trigger and the End-Day
 * missing-time backfill chips.
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = logSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid time segment", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }
  const d = parsed.data;

  try {
    const rows = await queryForSession<{ id: string }>(
      session,
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          started_at, ended_at, entity_type, entity_id, source, note)
       VALUES ($1, $2, ($3::timestamptz)::date, $4, $5, $3::timestamptz, $6::timestamptz, $7, $8, $9, $10)
       RETURNING id`,
      [
        session.accountId, session.userId, d.started_at,
        d.activity_type, activityCategoryFor(d.activity_type),
        d.ended_at, d.entity_type ?? null, d.entity_id ?? null, d.source, d.note ?? null,
      ]
    );
    return NextResponse.json({ data: { id: rows[0].id } }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/activities/log error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to log time", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
