/**
 * POST /api/v1/time-clock/clock-in — start the user's payroll clock.
 *
 * Idempotent: returns the already-open clock if one exists. Clocking in opens
 * today's business day (the container) and links to it. Independent of activity —
 * the clock only records that the person is working. See docs/canonical/OPERATIONS.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PAY_TYPES } from "@ai-fsm/domain";
import { clockIn } from "@/lib/operations/time-clock";

export const dynamic = "force-dynamic";

const schema = z.object({
  pay_type: z.enum(PAY_TYPES).optional(),
  hourly_rate_snapshot_cents: z.number().int().min(0).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const POST = withAuth(async (request: NextRequest, session) => {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid clock-in", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 400 },
    );
  }
  try {
    const { clock, alreadyOpen } = await withDbSession(session, (client) =>
      clockIn(client, session.accountId, session.userId, {
        payType: parsed.data.pay_type,
        hourlyRateSnapshotCents: parsed.data.hourly_rate_snapshot_cents ?? null,
        notes: parsed.data.notes ?? null,
      }),
    );
    return NextResponse.json({ data: { ...clock, already_open: alreadyOpen } }, { status: alreadyOpen ? 200 : 201 });
  } catch (error) {
    logger.error("POST /api/v1/time-clock/clock-in error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to clock in", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
