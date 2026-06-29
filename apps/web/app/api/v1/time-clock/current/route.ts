/**
 * GET /api/v1/time-clock/current — the user's currently-open payroll clock (or null).
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getOpenClock } from "@/lib/operations/time-clock";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const clock = await withDbSession(session, (client) =>
      getOpenClock(client, session.accountId, session.userId),
    );
    return NextResponse.json({ data: clock });
  } catch (error) {
    logger.error("GET /api/v1/time-clock/current error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load the clock", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
