import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { getDayReview } from "@/lib/day-review/queries";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, session) => {
  const date = request.url.match(/\/day-review\/([^/]+)/)?.[1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "date must be YYYY-MM-DD" } },
      { status: 400 },
    );
  }
  try {
    const payload = await getDayReview(session.accountId, date);
    if (!payload) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "No business day for this date" } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: payload });
  } catch (err) {
    logger.error("GET /api/v1/day-review/[date]", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load day review" } },
      { status: 500 },
    );
  }
});
