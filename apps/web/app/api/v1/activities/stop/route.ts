import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/** POST /api/v1/activities/stop — end the active activity (if any). */
export const POST = withAuth(async (_request: NextRequest, session) => {
  try {
    const rows = await queryForSession<{ id: string }>(
      session,
      `UPDATE activity_entries
       SET ended_at = now()
       WHERE account_id = $1 AND ended_at IS NULL AND voided_at IS NULL
       RETURNING id`,
      [session.accountId]
    );
    return NextResponse.json({ data: { stopped: rows.length > 0, id: rows[0]?.id ?? null } });
  } catch (error) {
    logger.error("POST /api/v1/activities/stop error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to stop activity", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
