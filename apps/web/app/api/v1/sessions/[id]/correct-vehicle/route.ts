import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { lastKnownOdometer, validateStartOdometer } from "@/lib/mileage/sessions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// "Change vehicle for this mileage session" — the owner picked the wrong
// vehicle. Re-validate odometers against the NEW vehicle's history, require a
// reason when correcting a completed session, and keep an audit trail.
const correctSchema = z.object({
  vehicle_id: z.string().uuid(),
  start_odometer: z.number().int().min(0).optional(),
  end_odometer: z.number().int().min(1).nullable().optional(),
  correction_reason: z.string().max(500).nullable().optional(),
});

function sessionIdFromPath(request: NextRequest): string | undefined {
  // .../sessions/{id}/correct-vehicle
  return request.nextUrl.pathname.split("/").at(-2);
}

function err(code: string, message: string, status: number, traceId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, traceId, ...(extra ?? {}) } }, { status });
}

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const id = sessionIdFromPath(request);
  if (!id) return err("NOT_FOUND", "Session not found", 404, session.traceId);

  const body = await request.json().catch(() => null);
  const parsed = correctSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
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

    const existing = await client.query<{
      id: string;
      vehicle_id: string | null;
      start_odometer: number | null;
      end_odometer: number | null;
    }>(
      `SELECT id, vehicle_id, start_odometer, end_odometer
       FROM vehicle_sessions WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [id, session.accountId]
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Session not found", 404, session.traceId);
    }

    const isCompleted = row.end_odometer != null;
    // Requirement 6: a completed session can only be reassigned with a reason.
    if (isCompleted && !d.correction_reason) {
      await client.query("ROLLBACK");
      return err("REASON_REQUIRED", "A correction reason is required to change the vehicle on a completed session", 422, session.traceId);
    }

    const vehicle = await client.query<{ id: string }>(
      `SELECT id FROM vehicles WHERE id = $1 AND account_id = $2 AND is_active = true`,
      [d.vehicle_id, session.accountId]
    );
    if (!vehicle.rows[0]) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Vehicle not found", 404, session.traceId);
    }

    const newStart = d.start_odometer ?? row.start_odometer;
    const newEnd = d.end_odometer === undefined ? row.end_odometer : d.end_odometer;
    if (newStart == null) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Session has no start odometer", 400, session.traceId);
    }
    if (newEnd != null && newEnd <= newStart) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "End odometer must be greater than start", 400, session.traceId);
    }

    // Re-validate the start against the NEW vehicle's history (excluding this
    // session itself, which may currently belong to it). A correction is
    // inherently explicit, so a backward move is allowed only with a reason.
    const lastKnown = await lastKnownOdometer(client, session.accountId, d.vehicle_id);
    const check = validateStartOdometer(lastKnown, newStart, { correction: !!d.correction_reason });
    if (!check.ok) {
      await client.query("ROLLBACK");
      return err(
        "ODOMETER_TOO_LOW",
        `Start odometer (${newStart.toLocaleString()}) is below the selected vehicle's last known reading (${check.lastKnown.toLocaleString()}). Add a correction reason to override.`,
        422,
        session.traceId,
        { last_known_odometer: check.lastKnown }
      );
    }

    const miles = newEnd != null ? newEnd - newStart : null;
    const { rows } = await client.query(
      `UPDATE vehicle_sessions
       SET vehicle_id = $1,
           start_odometer = $2,
           end_odometer = $3,
           miles = $4,
           correction_reason = COALESCE($5, correction_reason),
           updated_at = now()
       WHERE id = $6 AND account_id = $7
       RETURNING id, session_date::text, vehicle_id, start_odometer, end_odometer, miles::text`,
      [d.vehicle_id, newStart, newEnd, miles, d.correction_reason ?? null, id, session.accountId]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "vehicle_session",
      entity_id: id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: { vehicle_id: row.vehicle_id, start_odometer: row.start_odometer, end_odometer: row.end_odometer },
      new_value: { vehicle_id: d.vehicle_id, start_odometer: newStart, end_odometer: newEnd, correction_reason: d.correction_reason ?? null },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/sessions/[id]/correct-vehicle error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to change vehicle", 500, session.traceId);
  } finally {
    client.release();
  }
});
