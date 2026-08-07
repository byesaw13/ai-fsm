/**
 * POST /api/v1/vehicles/:id/fuel — log fuel + auto-create expense (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createFuelLogWithExpense } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  odometer: z.number().int().min(0).nullable().optional(),
  gallons: z.number().positive().max(500),
  amount_cents: z.number().int().positive(),
  is_full_tank: z.boolean().optional().default(true),
  vendor_name: z.string().max(120).optional(),
  notes: z.string().max(500).nullish(),
  filled_at: z.string().datetime().optional(),
});

export const POST = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  const vehicleId = req.nextUrl.pathname.split("/").at(-2) ?? "";
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid input", details: parsed.error.issues } },
      { status: 400 },
    );
  }
  const d = parsed.data;
  try {
    const result = await withDbSession(session, (client) =>
      createFuelLogWithExpense(client, {
        accountId: session.accountId,
        userId: session.userId,
        vehicleId,
        odometer: d.odometer ?? null,
        gallons: d.gallons,
        isFullTank: d.is_full_tank,
        amountCents: d.amount_cents,
        vendorName: d.vendor_name,
        notes: d.notes,
        filledAt: d.filled_at,
      }),
    );
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "VEHICLE_NOT_FOUND") {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    if (msg === "TRAILER_NO_FUEL") {
      return NextResponse.json(
        { error: { message: "Trailers do not log fuel" } },
        { status: 400 },
      );
    }
    logger.error("POST /api/v1/vehicles/:id/fuel", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to log fuel" } }, { status: 500 });
  }
});
