import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { listAttentionEvents } from "@/lib/attention";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  try {
    const limitRaw = request.nextUrl.searchParams.get("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) : 30;
    const events = await withInvoiceContext(session, (client) =>
      listAttentionEvents(client, session.accountId, Number.isFinite(limit) ? limit : 30),
    );
    return NextResponse.json({
      data: events.map((e) => ({
        id: e.id,
        type: e.type,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        title: e.title,
        summary: e.summary,
        href: e.href,
        created_at: e.created_at,
        read_at: e.read_at,
      })),
    });
  } catch (error) {
    logger.error("GET /api/v1/attention/events", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to load attention events", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
