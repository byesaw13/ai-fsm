import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const clientId = request.url.match(/\/clients\/([^/]+)\/communications/)?.[1];

  if (!clientId) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Client not found", traceId: session.traceId } },
      { status: 404 }
    );
  }

  try {
    const logs = await query(
      `SELECT *
       FROM communications_log
       WHERE client_id = $1 AND account_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [clientId, session.accountId]
    );

    return NextResponse.json({ logs });
  } catch (err) {
    logger.error("GET /api/v1/clients/[id]/communications error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to list communications", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
