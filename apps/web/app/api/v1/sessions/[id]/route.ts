import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const closeSessionSchema = z.object({
  end_odometer: z.number().int().min(1),
  notes: z.string().max(2000).nullable().optional(),
});

function sessionIdFromPath(request: NextRequest): string | undefined {
  return request.nextUrl.pathname.split("/").at(-1);
}

export const PATCH = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = sessionIdFromPath(request);
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Session not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = closeSessionSchema.safeParse(body);
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

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    const existing = await client.query<{
      id: string;
      start_odometer: number | null;
      end_odometer: number | null;
      miles: string | null;
      notes: string | null;
    }>(
      `SELECT id, start_odometer, end_odometer, miles::text AS miles, notes
       FROM vehicle_sessions
       WHERE id = $1 AND account_id = $2
       FOR UPDATE`,
      [id, session.accountId]
    );

    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    if (row.start_odometer == null) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Session has no start odometer", traceId: session.traceId } },
        { status: 400 }
      );
    }

    if (parsed.data.end_odometer <= row.start_odometer) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "End odometer must be greater than start", traceId: session.traceId } },
        { status: 400 }
      );
    }

    const notes = parsed.data.notes === undefined ? row.notes : parsed.data.notes;
    const { rows } = await client.query(
      `UPDATE vehicle_sessions
       SET end_odometer = $1,
           miles = $1 - start_odometer,
           notes = $4,
           updated_at = now()
       WHERE id = $2 AND account_id = $3
       RETURNING id, session_date::text, start_odometer, end_odometer, miles::text, notes`,
      [parsed.data.end_odometer, id, session.accountId, notes ?? null]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "vehicle_session",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: { end_odometer: row.end_odometer, miles: row.miles },
      new_value: { end_odometer: parsed.data.end_odometer, miles: parsed.data.end_odometer - row.start_odometer },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("PATCH /api/v1/sessions/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to close session", traceId: session.traceId } },
      { status: 500 }
    );
  } finally {
    client.release();
  }
});
