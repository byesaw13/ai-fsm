import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { loadDayDraft } from "@/lib/day-review/load-day-draft";
import { narrateDayDraft } from "@/lib/day-review/interpret-day-draft";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/day-review/[date]/draft
 * Assembles a proposed day from GPS + jobs + receipts. Read-only.
 * ?narrate=1 adds an optional AI summary (never changes the items).
 */
export const GET = withAuth(async (request: NextRequest, session) => {
  const date = request.url.match(/\/day-review\/([^/]+)\/draft/)?.[1] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "date must be YYYY-MM-DD" } },
      { status: 400 },
    );
  }
  try {
    const draft = await loadDayDraft(session.accountId, date);
    if (!draft) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No business day for this date" } },
        { status: 404 },
      );
    }
    const wantNarrative = request.nextUrl.searchParams.get("narrate") === "1";
    const summary = wantNarrative ? await narrateDayDraft(draft, date) : null;
    return NextResponse.json({ data: { date, draft, summary } });
  } catch (err) {
    logger.error("GET /api/v1/day-review/[date]/draft", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to assemble day draft" } },
      { status: 500 },
    );
  }
});
