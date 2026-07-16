import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { businessToday } from "@/lib/operations/business-day";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type EntryRow = {
  id: string;
  activity_type: string;
  category: string;
  started_at: string;
  ended_at: string | null;
  entity_type: string | null;
  entity_id: string | null;
  assignment_kind: string | null;
  labor_bucket: string | null;
  note: string | null;
};

/** GET /api/v1/activities/today — today's entries (oldest first) + the active one. */
export const GET = withAuth(async (_request: NextRequest, session) => {
  try {
    const rows = await queryForSession<EntryRow>(
      session,
      `SELECT id, activity_type, category, started_at::text, ended_at::text,
              entity_type, entity_id, assignment_kind, labor_bucket, note
       FROM activity_entries
       WHERE account_id = $1 AND session_date = $2::date AND voided_at IS NULL
       ORDER BY started_at ASC`,
      [session.accountId, businessToday()]
    );
    const active = rows.find((r) => r.ended_at === null) ?? null;
    return NextResponse.json({ data: { entries: rows, active } });
  } catch (error) {
    logger.error("GET /api/v1/activities/today error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load activities", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
