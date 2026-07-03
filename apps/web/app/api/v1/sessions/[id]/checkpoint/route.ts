import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { lastCheckpointOdometer } from "@/lib/mileage/sessions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const checkpointSchema = z.object({
  odometer: z.number().int().min(1),
});

function sessionIdFromPath(request: NextRequest): string | undefined {
  return request.nextUrl.pathname.split("/").slice(-2)[0];
}

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = sessionIdFromPath(request);
  if (!id) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Session not found", traceId: session.traceId } },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkpointSchema.safeParse(body);
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
      { status: 400 },
    );
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role],
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
      [id, session.accountId],
    );

    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Session not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    if (row.end_odometer != null || row.miles != null) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "SESSION_CLOSED", message: "Session is already closed", traceId: session.traceId } },
        { status: 409 },
      );
    }

    if (row.start_odometer == null) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Session has no start odometer", traceId: session.traceId } },
        { status: 400 },
      );
    }

    const floor = lastCheckpointOdometer(row.notes, row.start_odometer);
    if (parsed.data.odometer < floor) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message:
              floor > row.start_odometer
                ? "Odometer must be at or above the last checkpoint reading"
                : "Odometer must be at or above the session start reading",
            traceId: session.traceId,
          },
        },
        { status: 400 },
      );
    }

    const stamp = new Date().toISOString();
    const line = `[checkpoint ${stamp}] ${parsed.data.odometer} mi`;
    const notes = row.notes?.trim() ? `${row.notes.trim()}\n${line}` : line;

    const { rows } = await client.query<{
      id: string;
      notes: string | null;
    }>(
      `UPDATE vehicle_sessions
       SET notes = $1, updated_at = now()
       WHERE id = $2 AND account_id = $3
       RETURNING id, notes`,
      [notes, id, session.accountId],
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "vehicle_session",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: { notes: row.notes },
      new_value: { checkpoint_odometer: parsed.data.odometer, notes },
    });

    await client.query("COMMIT");
    return NextResponse.json({
      data: {
        id: rows[0].id,
        last_checkpoint_odometer: parsed.data.odometer,
        notes: rows[0].notes,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/sessions/[id]/checkpoint error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save checkpoint", traceId: session.traceId } },
      { status: 500 },
    );
  } finally {
    client.release();
  }
});