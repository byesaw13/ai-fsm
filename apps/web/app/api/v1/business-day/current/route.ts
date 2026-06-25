/**
 * GET  /api/v1/business-day/current — today's business day for the user (or null).
 * POST /api/v1/business-day/current — ensure today's business day is open (idempotent).
 *
 * The Business Day is a pure aggregate (docs/canonical/OPERATIONS.md). Opening it
 * never starts payroll/activity/mileage — those are independent concerns.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getBusinessDay, openBusinessDay } from "@/lib/operations/business-day";

export const dynamic = "force-dynamic";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const day = await withDbSession(session, (client) =>
      getBusinessDay(client, session.accountId, session.userId, todayKey()),
    );
    return NextResponse.json({ data: day });
  } catch (error) {
    logger.error("GET /api/v1/business-day/current error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load business day", traceId: session.traceId } },
      { status: 500 },
    );
  }
});

export const POST = withAuth(async (_request: NextRequest, session) => {
  try {
    const day = await withDbSession(session, (client) =>
      openBusinessDay(client, session.accountId, session.userId, todayKey(), session.userId),
    );
    return NextResponse.json({ data: day });
  } catch (error) {
    logger.error("POST /api/v1/business-day/current error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to open business day", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
