import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const startSessionSchema = z.object({
  vehicle_id: z.string().uuid().nullable().optional(),
  start_odometer: z.number().int().min(0),
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = startSessionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const sessionDate = d.session_date ?? todayKey();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await client.query<{ id: string }>(
      `SELECT id
       FROM vehicle_sessions
       WHERE account_id = $1
         AND session_date = $2::date
         AND end_odometer IS NULL
         AND miles IS NULL
       LIMIT 1`,
      [session.accountId, sessionDate]
    );

    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "OPEN_SESSION_EXISTS",
            message: "A day is already started for this date",
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }

    if (d.vehicle_id) {
      const vehicle = await client.query<{ id: string }>(
        `SELECT id FROM vehicles WHERE id = $1 AND account_id = $2 AND is_active = true`,
        [d.vehicle_id, session.accountId]
      );
      if (!vehicle.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: "Vehicle not found", traceId: session.traceId } },
          { status: 404 }
        );
      }
    }

    const { rows } = await client.query<{
      id: string;
      session_date: string;
      vehicle_id: string | null;
      start_odometer: number;
    }>(
      `INSERT INTO vehicle_sessions
         (account_id, vehicle_id, session_date, start_odometer, end_odometer, miles, notes, created_by)
       VALUES ($1, $2, $3::date, $4, NULL, NULL, $5, $6)
       RETURNING id, session_date::text, vehicle_id, start_odometer`,
      [
        session.accountId,
        d.vehicle_id ?? null,
        sessionDate,
        d.start_odometer,
        d.notes ?? null,
        session.userId,
      ]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "vehicle_session",
      entity_id: rows[0].id,
      action: "insert",
      actor_id: session.userId,
      trace_id: session.traceId,
      new_value: { session_date: sessionDate, start_odometer: d.start_odometer, status: "open" },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/sessions/start error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to start day", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
