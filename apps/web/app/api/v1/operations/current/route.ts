/**
 * GET /api/v1/operations/current — derived live ops state for the session user (TASK-056).
 * Read-only: open business day, clock, activity, vehicle session + valid_transitions.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCurrentOperationsState } from "@/lib/operations/state";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const state = await withDbSession(session, (client) =>
      getCurrentOperationsState(client, session.accountId, session.userId),
    );
    return NextResponse.json({ data: state });
  } catch (error) {
    logger.error("GET /api/v1/operations/current error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load current operations state",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
