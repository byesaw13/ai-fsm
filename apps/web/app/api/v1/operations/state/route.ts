/**
 * GET /api/v1/operations/state — the live Current Operations State (TASK-056).
 *
 * Always-known "now": business day · clocked-in? · current activity (verb +
 * assignment) · open vehicle session. Derived read-model — no mutation, no lock.
 * See docs/canonical/OPERATIONS.md.
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
    logger.error("GET /api/v1/operations/state error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load operations state", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
