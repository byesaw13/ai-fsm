/**
 * GET/POST /api/v1/vehicles/:id/schedules — service interval schedules (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { assertVehicleInAccount } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

function vehicleIdFromPath(pathname: string): string {
  const m = pathname.match(/\/vehicles\/([^/]+)/);
  return m?.[1] ?? "";
}

const postSchema = z
  .object({
    service_type: z.string().min(1).max(40),
    interval_miles: z.number().int().positive().nullable().optional(),
    interval_months: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (d) =>
      (d.interval_miles != null && d.interval_miles > 0) ||
      (d.interval_months != null && d.interval_months > 0),
    { message: "At least one of interval_miles or interval_months is required" },
  );

type ScheduleRow = {
  id: string;
  service_type: string;
  interval_miles: number | null;
  interval_months: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const GET = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
  try {
    const rows = await withDbSession(session, async (client) => {
      const vehicle = await assertVehicleInAccount(client, session.accountId, vehicleId);
      if (!vehicle) return null;
      const { rows: schedules } = await client.query<ScheduleRow>(
        `SELECT id, service_type, interval_miles, interval_months, is_active,
                created_at::text, updated_at::text
         FROM vehicle_service_schedules
         WHERE account_id = $1 AND vehicle_id = $2
         ORDER BY is_active DESC, service_type ASC`,
        [session.accountId, vehicleId],
      );
      return schedules;
    });
    if (rows === null) {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error("GET /api/v1/vehicles/:id/schedules", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to list schedules" } }, { status: 500 });
  }
});

export const POST = withRole(["owner", "admin"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
  const raw = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid input", details: parsed.error.issues } },
      { status: 400 },
    );
  }
  const d = parsed.data;
  try {
    const row = await withDbSession(session, async (client) => {
      const vehicle = await assertVehicleInAccount(client, session.accountId, vehicleId);
      if (!vehicle) throw new Error("VEHICLE_NOT_FOUND");

      // Deactivate existing active schedule for same service_type, then insert.
      await client.query(
        `UPDATE vehicle_service_schedules
         SET is_active = false, updated_at = now()
         WHERE account_id = $1 AND vehicle_id = $2
           AND service_type = $3 AND is_active = true`,
        [session.accountId, vehicleId, d.service_type],
      );

      const { rows } = await client.query<ScheduleRow>(
        `INSERT INTO vehicle_service_schedules (
           account_id, vehicle_id, service_type, interval_miles, interval_months
         ) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, service_type, interval_miles, interval_months, is_active,
                   created_at::text, updated_at::text`,
        [
          session.accountId,
          vehicleId,
          d.service_type,
          d.interval_miles ?? null,
          d.interval_months ?? null,
        ],
      );
      return rows[0];
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "VEHICLE_NOT_FOUND") {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    logger.error("POST /api/v1/vehicles/:id/schedules", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to create schedule" } }, { status: 500 });
  }
});
