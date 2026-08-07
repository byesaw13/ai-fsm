/**
 * POST /api/v1/vehicles/:id/renewals/complete — record renewal + expense (TASK-093).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createRenewalRecordWithExpense } from "@/lib/vehicles/capture";

export const dynamic = "force-dynamic";

function vehicleIdFromPath(pathname: string): string {
  const m = pathname.match(/\/vehicles\/([^/]+)/);
  return m?.[1] ?? "";
}

const bodySchema = z.object({
  renewal_type: z.enum([
    "registration",
    "insurance",
    "inspection",
    "emissions",
    "other",
  ]),
  renewed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  amount_cents: z.number().int().positive(),
  vendor_name: z.string().max(120).nullish(),
  notes: z.string().max(500).nullish(),
  next_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullish(),
});

export const POST = withRole(["owner", "admin", "tech"], async (req: NextRequest, session) => {
  const vehicleId = vehicleIdFromPath(req.nextUrl.pathname);
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
      createRenewalRecordWithExpense(client, {
        accountId: session.accountId,
        userId: session.userId,
        vehicleId,
        renewalType: d.renewal_type,
        renewedAt: d.renewed_at,
        amountCents: d.amount_cents,
        vendorName: d.vendor_name,
        notes: d.notes,
        nextDueDate: d.next_due_date,
      }),
    );
    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "VEHICLE_NOT_FOUND") {
      return NextResponse.json({ error: { message: "Vehicle not found" } }, { status: 404 });
    }
    if (msg === "AMOUNT_REQUIRED") {
      return NextResponse.json(
        { error: { message: "amount_cents must be positive" } },
        { status: 400 },
      );
    }
    logger.error("POST /api/v1/vehicles/:id/renewals/complete", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json({ error: { message: "Failed to complete renewal" } }, { status: 500 });
  }
});
