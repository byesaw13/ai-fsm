/**
 * POST /api/v1/time-clock/clock-out — close the user's open payroll clock.
 *
 * Returns 409 if there is no open clock. Does not touch the activity timeline or
 * the business day — clocking out only ends paid time.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { clockOut } from "@/lib/operations/time-clock";

export const dynamic = "force-dynamic";

export const POST = withAuth(async (_request: NextRequest, session) => {
  try {
    const closed = await withDbSession(session, (client) =>
      clockOut(client, session.accountId, session.userId),
    );
    if (!closed) {
      return NextResponse.json(
        { error: { code: "NO_OPEN_CLOCK", message: "You're not clocked in.", traceId: session.traceId } },
        { status: 409 },
      );
    }
    return NextResponse.json({ data: closed });
  } catch (error) {
    logger.error("POST /api/v1/time-clock/clock-out error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to clock out", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
