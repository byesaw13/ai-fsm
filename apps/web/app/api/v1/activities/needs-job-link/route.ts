import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function normalizedDay(request: NextRequest): string {
  const d = request.nextUrl.searchParams.get("date");
  if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date().toLocaleDateString("en-CA");
}

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const day = normalizedDay(request);
  try {
    const activities = await queryForSession(
      session,
      `SELECT id, activity_type, started_at::text, ended_at::text, note
         FROM activity_entries
        WHERE account_id = $1
          AND session_date = $2::date
          AND voided_at IS NULL
          AND entity_id IS NULL
          AND ended_at IS NOT NULL
          AND activity_type IN ('job_work','travel','material_run','estimate_visit','follow_up')
        ORDER BY started_at ASC`,
      [session.accountId, day],
    );
    return NextResponse.json({ data: { activities } });
  } catch (error) {
    logger.error("GET /api/v1/activities/needs-job-link error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load activities needing job link", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
