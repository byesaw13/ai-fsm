import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { canSendInvoices } from "@/lib/auth/permissions";
import { logger } from "@/lib/logger";
import { sendInvoice } from "@/lib/invoices/send";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;

  if (!canSendInvoices(session.role)) {
    return NextResponse.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "The office sends bills. Field files the work.",
          traceId: session.traceId,
        },
      },
      { status: 403 },
    );
  }

  try {
    const result = await sendInvoice(session, id);

    if (result.status === 404) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Invoice not found" } }, { status: 404 });
    }
    if (result.status !== 200) {
      return NextResponse.json({ error: { code: "SEND_ERROR", message: result.message } }, { status: result.status });
    }

    return NextResponse.json({ sent: true, sentTo: result.sentTo, isPaid: result.isPaid });
  } catch (error) {
    logger.error("POST /api/v1/invoices/[id]/send error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to send invoice", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
