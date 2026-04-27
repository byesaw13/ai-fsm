import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query, getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const createMileageSchema = z.object({
  trip_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  miles: z.number().positive(),
  purpose: z.string().min(1).max(500),
  notes: z.string().max(1000).nullable().optional(),
  job_id: z.string().uuid().nullable().optional(),
});

// GET /api/v1/mileage?month=YYYY-MM
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const month = request.nextUrl.searchParams.get("month");
  const jobId = request.nextUrl.searchParams.get("job_id");

  try {
    const conditions: string[] = ["account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      conditions.push(`to_char(trip_date, 'YYYY-MM') = $${idx++}`);
      params.push(month);
    }
    if (jobId) {
      conditions.push(`job_id = $${idx++}`);
      params.push(jobId);
    }

    const rows = await query(
      `SELECT m.id, m.trip_date, m.miles, m.purpose, m.notes,
              m.job_id, m.created_by, m.created_at,
              j.title AS job_title,
              u.full_name AS created_by_name
       FROM mileage_logs m
       LEFT JOIN jobs j ON j.id = m.job_id
       LEFT JOIN users u ON u.id = m.created_by
       WHERE ${conditions.join(" AND ")}
       ORDER BY m.trip_date DESC, m.created_at DESC
       LIMIT 200`,
      params
    );

    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("GET /api/v1/mileage error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch mileage logs", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

// POST /api/v1/mileage
export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = createMileageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }

  const { trip_date, miles, purpose, notes, job_id } = parsed.data;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const { rows } = await client.query(
      `INSERT INTO mileage_logs (account_id, trip_date, miles, purpose, notes, job_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [session.accountId, trip_date, miles, purpose, notes ?? null, job_id ?? null, session.userId]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "mileage_log",
      entity_id: rows[0].id,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { trip_date, miles, purpose, job_id },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: { id: rows[0].id } }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/mileage error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create mileage log", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
