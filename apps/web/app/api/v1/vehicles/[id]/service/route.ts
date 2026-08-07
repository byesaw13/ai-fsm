/**
 * POST /api/v1/vehicles/:id/service — service visit + one expense (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createServiceRecordWithExpense } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  serviced_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  odometer: z.number().int().min(0).nullable().optional(),
  service_types: z.array(z.string().min(1).max(40)).min(1).max(12),
  amount_cents: z.number().int().positive(),
  vendor_name: z.string().max(120).nullish(),
  notes: z.string().max(500).nullish(),
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
      createServiceRecordWithExpense(client, {
        accountId: session.accountId,
        userId: session.userId,
        vehicleId,
        servicedAt: d.serviced_at,
        odometer: d.odometer ?? null,
        serviceTypes: d.service_types,
        amountCents: d.amount_cents,
        vendorName: d.vendor_name,
        notes: d.notes,
      }),
    );
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "VEHICLE_NOT_FOUND") {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    if (msg === "SERVICE_TYPES_REQUIRED") {
      return NextResponse.json(
        { error: { message: "Pick at least one service type" } },
        { status: 400 },
      );
    }
    logger.error("POST /api/v1/vehicles/:id/service", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to log service" } }, { status: 500 });
  }
});
