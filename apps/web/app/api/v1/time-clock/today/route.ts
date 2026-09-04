/**
 * GET /api/v1/time-clock/today — the user's correctable clock sessions
 * (any open session + today's), newest first. Feeds the clock-correction UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { listTodayClocks } from "@/lib/operations/time-clock";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const rows = await withDbSession(session, (client) =>
      listTodayClocks(client, session.accountId, session.userId),
    );
    return NextResponse.json({ data: rows });
  } catch (error) {
    logger.error("GET /api/v1/time-clock/today error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load clock sessions", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
