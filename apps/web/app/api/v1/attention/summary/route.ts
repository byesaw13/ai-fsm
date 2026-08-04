import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { loadAttentionSummary } from "@/lib/attention";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (_req, session) => {
  try {
    const summary = await withInvoiceContext(session, (client) =>
      loadAttentionSummary(client, session.accountId),
    );
    return NextResponse.json({ data: summary });
  } catch (error) {
    logger.error("GET /api/v1/attention/summary", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to load attention summary", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
