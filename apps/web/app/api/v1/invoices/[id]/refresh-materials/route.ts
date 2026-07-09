import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import { refreshJobMaterialsOnInvoice } from "@/lib/invoices/job-expenses";
import { assertDraftInvoice, recalculateInvoiceTotals } from "@/lib/invoices/line-items";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const data = await withInvoiceContext(session, async (client) => {
      const invoice = await assertDraftInvoice(client, invoiceId, session.accountId);
      if (!invoice.job_id) {
        throw Object.assign(new Error("Invoice is not linked to a job"), {
          code: "INVALID_INVOICE",
        });
      }

      const { lineItems } = await refreshJobMaterialsOnInvoice(
        client,
        invoiceId,
        session.accountId,
        invoice.job_id,
      );

      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "refresh_materials", added: lineItems.length, totals },
      });

      return { line_items: lineItems, totals };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "IMMUTABLE_ENTITY" || err.code === "INVALID_INVOICE") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: err.code === "IMMUTABLE_ENTITY" ? 422 : 400 },
      );
    }

    logger.error("POST /api/v1/invoices/[id]/refresh-materials error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to refresh material lines",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});