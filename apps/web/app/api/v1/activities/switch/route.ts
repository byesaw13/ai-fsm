import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ACTIVITY_TYPES, ACTIVITY_ENTITY_TYPES, ASSIGNMENT_KINDS, activityCategoryFor } from "@ai-fsm/domain";
import { businessToday } from "@/lib/operations/business-day";

export const dynamic = "force-dynamic";

const switchSchema = z.object({
  activity_type: z.enum(ACTIVITY_TYPES),
  entity_type: z.enum(ACTIVITY_ENTITY_TYPES).nullable().optional(),
  entity_id: z.string().uuid().nullable().optional(),
  // Non-entity assignment (Office / Shop / Inventory / Training). The entity
  // assignments use entity_type/entity_id above; this is for the rest.
  assignment_kind: z.enum(ASSIGNMENT_KINDS).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  source: z.enum(["manual", "auto_visit", "auto_material_run", "auto_estimate"]).default("manual"),
})
  .refine((d) => (d.entity_type == null) === (d.entity_id == null), {
    message: "entity_type and entity_id must be provided together",
  })
  // An activity attaches to ONE assignment: either an entity (job/visit/…) or a
  // non-entity assignment_kind, never both.
  .refine((d) => !(d.assignment_kind != null && d.entity_type != null), {
    message: "An activity has one assignment — an entity or an assignment_kind, not both.",
    path: ["assignment_kind"],
  });

/**
 * POST /api/v1/activities/switch
 *
 * The one gesture of the activity ledger: atomically closes the active
 * activity (if any) and starts the new one. Switching to the SAME type with
 * the same entity link is a no-op (returns the running entry) so hard
 * triggers can fire idempotently.
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = switchSchema.safeParse(body);
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

    const active = await client.query<{ id: string; activity_type: string; entity_id: string | null; entity_type: string | null; assignment_kind: string | null }>(
      `SELECT id, activity_type, entity_type, entity_id, assignment_kind
       FROM activity_entries
       WHERE account_id = $1 AND ended_at IS NULL AND voided_at IS NULL
       FOR UPDATE`,
      [session.accountId]
    );

    const current = active.rows[0];
    if (
      current &&
      current.activity_type === d.activity_type &&
      (current.entity_type ?? null) === (d.entity_type ?? null) &&
      (current.entity_id ?? null) === (d.entity_id ?? null) &&
      (current.assignment_kind ?? null) === (d.assignment_kind ?? null)
    ) {
      // Idempotent: already doing exactly this — same verb AND same assignment
      // (so switching e.g. Office → Shop is NOT swallowed).
      await client.query("COMMIT");
      return NextResponse.json({ data: { id: current.id, unchanged: true } });
    }

    if (current) {
      await client.query(
        `UPDATE activity_entries SET ended_at = now() WHERE id = $1`,
        [current.id]
      );
    }

    // The business-local date — used for BOTH session_date and the business_day
    // lookup so they always agree (a 10pm-ET switch on a UTC server must not store
    // tomorrow's session_date while linking today's business day).
    const today = businessToday();

    // Link the new activity to today's business day and the open payroll clock,
    // if they exist (references only — the activity stays independent; we never
    // open a day or clock just to switch). labor_bucket auto-fills via trigger.
    const dayRes = await client.query<{ id: string }>(
      `SELECT id FROM business_days
        WHERE account_id = $1 AND user_id = $2 AND business_date = $3 LIMIT 1`,
      [session.accountId, session.userId, today]
    );
    const clockRes = await client.query<{ id: string }>(
      `SELECT id FROM time_clock_sessions
        WHERE account_id = $1 AND user_id = $2 AND status = 'open' AND voided_at IS NULL LIMIT 1`,
      [session.accountId, session.userId]
    );

    const { rows } = await client.query<{ id: string; started_at: string }>(
      `INSERT INTO activity_entries
         (account_id, user_id, session_date, activity_type, category,
          entity_type, entity_id, source, note,
          business_day_id, time_clock_session_id, assignment_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, started_at::text`,
      [
        session.accountId, session.userId, today, d.activity_type, category,
        d.entity_type ?? null, d.entity_id ?? null, d.source, d.note ?? null,
        dayRes.rows[0]?.id ?? null, clockRes.rows[0]?.id ?? null, d.assignment_kind ?? null,
      ]
    );

    await client.query("COMMIT");
    return NextResponse.json(
      { data: { id: rows[0].id, started_at: rows[0].started_at, closed_previous: !!current } },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/activities/switch error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to switch activity", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
