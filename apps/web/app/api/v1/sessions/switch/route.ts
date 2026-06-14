import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import {
  findOpenSessionForVehicle,
  lastKnownOdometer,
  validateStartOdometer,
} from "@/lib/mileage/sessions";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Switch vehicles mid-day: close the current open session (with its end
// odometer) and open a new one for another vehicle, in one transaction. The
// work day keeps running — activity entries are untouched.
const switchSchema = z.object({
  close_session_id: z.string().uuid(),
  end_odometer: z.number().int().min(1),
  new_vehicle_id: z.string().uuid(),
  new_start_odometer: z.number().int().min(0),
  notes: z.string().max(2000).nullable().optional(),
  correction: z.boolean().optional(),
  correction_reason: z.string().max(500).nullable().optional(),
});

function err(code: string, message: string, status: number, traceId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message, traceId, ...(extra ?? {}) } }, { status });
}

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  const body = await request.json().catch(() => null);
  const parsed = switchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const isCorrection = d.correction === true && !!d.correction_reason;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `SELECT set_config('app.current_user_id', $1, true), set_config('app.current_account_id', $2, true), set_config('app.current_role', $3, true)`,
      [session.userId, session.accountId, session.role]
    );

    // 1) Close the current session.
    const current = await client.query<{
      id: string;
      vehicle_id: string | null;
      session_date: string;
      start_odometer: number | null;
      end_odometer: number | null;
    }>(
      `SELECT id, vehicle_id, session_date::text AS session_date, start_odometer, end_odometer
       FROM vehicle_sessions WHERE id = $1 AND account_id = $2 FOR UPDATE`,
      [d.close_session_id, session.accountId]
    );
    const cur = current.rows[0];
    if (!cur) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Session to close not found", 404, session.traceId);
    }
    if (cur.end_odometer != null) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "That mileage session is already closed", 400, session.traceId);
    }
    if (cur.start_odometer == null) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "Session has no start odometer", 400, session.traceId);
    }
    if (d.end_odometer <= cur.start_odometer) {
      await client.query("ROLLBACK");
      return err("VALIDATION_ERROR", "End odometer must be greater than start", 400, session.traceId);
    }

    await client.query(
      `UPDATE vehicle_sessions
       SET end_odometer = $1, miles = $1 - start_odometer, ended_at = now(), updated_at = now()
       WHERE id = $2 AND account_id = $3`,
      [d.end_odometer, cur.id, session.accountId]
    );

    // 2) Validate and open the new session.
    const vehicle = await client.query<{ id: string }>(
      `SELECT id FROM vehicles WHERE id = $1 AND account_id = $2 AND is_active = true`,
      [d.new_vehicle_id, session.accountId]
    );
    if (!vehicle.rows[0]) {
      await client.query("ROLLBACK");
      return err("NOT_FOUND", "Vehicle not found", 404, session.traceId);
    }

    const openPrior = await findOpenSessionForVehicle(client, session.accountId, d.new_vehicle_id);
    if (openPrior) {
      await client.query("ROLLBACK");
      return err(
        "INCOMPLETE_PRIOR_SESSION",
        "The vehicle you're switching to has an open mileage session. Close it first.",
        409,
        session.traceId,
        { open_session_id: openPrior.id, suggested_end_odometer: d.new_start_odometer }
      );
    }

    const lastKnown = await lastKnownOdometer(client, session.accountId, d.new_vehicle_id);
    const check = validateStartOdometer(lastKnown, d.new_start_odometer, { correction: isCorrection });
    if (!check.ok) {
      await client.query("ROLLBACK");
      return err(
        "ODOMETER_TOO_LOW",
        `Start odometer (${d.new_start_odometer.toLocaleString()}) is below this vehicle's last known reading (${check.lastKnown.toLocaleString()}).`,
        422,
        session.traceId,
        { last_known_odometer: check.lastKnown }
      );
    }

    const { rows } = await client.query<{
      id: string;
      session_date: string;
      vehicle_id: string | null;
      start_odometer: number;
    }>(
      `INSERT INTO vehicle_sessions
         (account_id, vehicle_id, session_date, start_odometer, end_odometer, miles, notes, correction_reason, started_at, created_by)
       VALUES ($1, $2, $3::date, $4, NULL, NULL, $5, $6, now(), $7)
       RETURNING id, session_date::text, vehicle_id, start_odometer`,
      [
        session.accountId,
        d.new_vehicle_id,
        cur.session_date,
        d.new_start_odometer,
        d.notes ?? null,
        isCorrection ? d.correction_reason : null,
        session.userId,
      ]
    );

    await appendAuditLog(client, {
      account_id: session.accountId,
      entity_type: "vehicle_session",
      entity_id: cur.id,
      action: "update",
      actor_id: session.userId,
      trace_id: session.traceId,
      old_value: { status: "open", vehicle_id: cur.vehicle_id },
      new_value: { status: "closed", end_odometer: d.end_odometer, switched_to_session: rows[0].id, switched_to_vehicle: d.new_vehicle_id },
    });

    await client.query("COMMIT");
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("POST /api/v1/sessions/switch error", error, { traceId: session.traceId });
    return err("INTERNAL_ERROR", "Failed to switch vehicle", 500, session.traceId);
  } finally {
    client.release();
  }
});
