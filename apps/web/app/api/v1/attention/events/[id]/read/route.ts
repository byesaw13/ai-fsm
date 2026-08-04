import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { markAttentionEventRead } from "@/lib/attention";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request, session) => {
  // Path: /api/v1/attention/events/{id}/read
  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  const eventId = parts[parts.length - 2] ?? "";
  try {
    const ok = await withInvoiceContext(session, (client) =>
      markAttentionEventRead(client, session.accountId, eventId),
    );
    if (!ok) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Event not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    logger.error("POST /api/v1/attention/events/[id]/read", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to mark event read", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
