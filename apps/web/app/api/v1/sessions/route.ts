import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const ENTITY_TYPES = ["job", "visit", "estimate", "supplier_run", "other"] as const;

const activitySchema = z.object({
  entity_type: z.enum(ENTITY_TYPES),
  entity_id:   z.string().uuid().nullable().optional(),
  label:       z.string().max(200).nullable().optional(),
});

const createSessionSchema = z.object({
  session_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  vehicle_id:      z.string().uuid().optional(),
  start_odometer:  z.number().int().min(0).optional(),
  end_odometer:    z.number().int().min(1).optional(),
  miles:           z.number().positive().optional(),
  notes:           z.string().max(2000).nullable().optional(),
  activities:      z.array(activitySchema).max(20).optional(),
}).refine(
  (d) => (d.start_odometer !== undefined && d.end_odometer !== undefined) || d.miles !== undefined,
  { message: "Provide either start/end odometer readings or a miles value" }
).refine(
  (d) => d.start_odometer === undefined || d.end_odometer === undefined || d.end_odometer > d.start_odometer,
  { message: "End odometer must be greater than start" }
);

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const month = request.nextUrl.searchParams.get("month");

  const conditions = ["s.account_id = $1"];
  const params: unknown[] = [session.accountId];
  let idx = 2;

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    conditions.push(`to_char(s.session_date, 'YYYY-MM') = $${idx++}`);
    params.push(month);
  }

  try {
    const rows = await query(
      `SELECT s.id, s.session_date::text,
              COALESCE(s.miles, s.end_odometer - s.start_odometer) AS miles,
              s.start_odometer, s.end_odometer, s.notes,
              s.vehicle_id, v.nickname AS vehicle_nickname, v.plate AS vehicle_plate,
              s.created_by, u.full_name AS created_by_name,
              s.created_at::text,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',           a.id,
                    'entity_type',  a.entity_type,
                    'entity_id',    a.entity_id,
                    'label',        a.label,
                    'entity_title', CASE
                      WHEN a.entity_type = 'job'      THEN j.title
                      WHEN a.entity_type = 'visit'    THEN vis.title
                      WHEN a.entity_type = 'estimate' THEN est.id_short
                      ELSE NULL
                    END
                  ) ORDER BY a.created_at
                ) FILTER (WHERE a.id IS NOT NULL),
                '[]'::json
              ) AS activities
       FROM vehicle_sessions s
       LEFT JOIN vehicles v   ON v.id = s.vehicle_id
       LEFT JOIN users u      ON u.id = s.created_by
       LEFT JOIN vehicle_session_activities a ON a.session_id = s.id
       LEFT JOIN jobs j        ON j.id = a.entity_id AND a.entity_type = 'job'
       LEFT JOIN visits vis    ON vis.id = a.entity_id AND a.entity_type = 'visit'
       LEFT JOIN estimates est ON est.id = a.entity_id AND a.entity_type = 'estimate'
       WHERE ${conditions.join(" AND ")}
       GROUP BY s.id, v.nickname, v.plate, u.full_name
       ORDER BY s.session_date DESC, s.created_at DESC
       LIMIT 200`,
      params
    );
    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("GET /api/v1/sessions error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch sessions", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = createSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const computedMiles = d.start_odometer !== undefined && d.end_odometer !== undefined
    ? d.end_odometer - d.start_odometer
    : d.miles!;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const milesSource =
      d.start_odometer !== undefined && d.end_odometer !== undefined ? "odometer" : "manual_miles";
    const { rows } = await client.query(
      `INSERT INTO vehicle_sessions
         (account_id, vehicle_id, session_date, start_odometer, end_odometer, miles, notes,
          created_by, miles_source, status, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'closed', now(), now())
       RETURNING id`,
      [
        session.accountId,
        d.vehicle_id ?? null,
        d.session_date,
        d.start_odometer ?? null,
        d.end_odometer ?? null,
        computedMiles,
        d.notes ?? null,
        session.userId,
        milesSource,
      ]
    );
    const sessionId = rows[0].id;

    if (d.activities?.length) {
      for (const act of d.activities) {
        await client.query(
          `INSERT INTO vehicle_session_activities (session_id, entity_type, entity_id, label) VALUES ($1, $2, $3, $4)`,
          [sessionId, act.entity_type, act.entity_id ?? null, act.label ?? null]
        );
      }
    }

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "vehicle_session",
      entity_id: sessionId,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { session_date: d.session_date, miles: computedMiles, activity_count: d.activities?.length ?? 0 },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { id: sessionId } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/sessions error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create session", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
