/**
 * GET/POST /api/v1/vehicles/:id/renewals — renewal schedules (TASK-093).
 * Completions live at .../renewals/complete.
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

const renewalTypeSchema = z.enum([
  "registration",
  "insurance",
  "inspection",
  "emissions",
  "other",
]);

const postSchema = z.object({
  renewal_type: renewalTypeSchema,
  current_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  interval_months: z.number().int().positive().optional(),
  provider: z.string().max(120).nullish(),
});

type RenewalRow = {
  id: string;
  renewal_type: string;
  provider: string | null;
  interval_months: number;
  current_due_date: string;
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
      const { rows: renewals } = await client.query<RenewalRow>(
        `SELECT id, renewal_type, provider, interval_months, current_due_date::text,
                is_active, created_at::text, updated_at::text
         FROM vehicle_renewals
         WHERE account_id = $1 AND vehicle_id = $2
         ORDER BY is_active DESC, current_due_date ASC`,
        [session.accountId, vehicleId],
      );
      return renewals;
    });
    if (rows === null) {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    return NextResponse.json({ data: rows });
  } catch (err) {
    logger.error("GET /api/v1/vehicles/:id/renewals", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to list renewals" } }, { status: 500 });
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

      // Soft-replace: deactivate prior active schedule of same type.
      await client.query(
        `UPDATE vehicle_renewals
         SET is_active = false, updated_at = now()
         WHERE account_id = $1 AND vehicle_id = $2
           AND renewal_type = $3 AND is_active = true`,
        [session.accountId, vehicleId, d.renewal_type],
      );

      const { rows } = await client.query<RenewalRow>(
        `INSERT INTO vehicle_renewals (
           account_id, vehicle_id, renewal_type, provider, interval_months, current_due_date
         ) VALUES ($1, $2, $3, $4, $5, $6::date)
         RETURNING id, renewal_type, provider, interval_months, current_due_date::text,
                   is_active, created_at::text, updated_at::text`,
        [
          session.accountId,
          vehicleId,
          d.renewal_type,
          d.provider ?? null,
          d.interval_months ?? 12,
          d.current_due_date.slice(0, 10),
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
    logger.error("POST /api/v1/vehicles/:id/renewals", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to create renewal" } }, { status: 500 });
  }
});
