import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { loadFieldSiteContext } from "@/lib/field/site-context";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (_request, session) => {
  try {
    return await withDbSession(session, async (client) => {
      const data = await loadFieldSiteContext(client, session.accountId, session.userId);
      return NextResponse.json({ data });
    });
  } catch (error) {
    logger.error("GET /api/v1/field/site-context error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to load site context", traceId: session.traceId } },
      { status: 500 },
    );
  }
});