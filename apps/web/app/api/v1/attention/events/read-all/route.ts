import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { markAllAttentionEventsRead } from "@/lib/attention";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (_req, session) => {
  try {
    const updated = await withInvoiceContext(session, (client) =>
      markAllAttentionEventsRead(client, session.accountId),
    );
    return NextResponse.json({ data: { updated } });
  } catch (error) {
    logger.error("POST /api/v1/attention/events/read-all", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to mark events read", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
