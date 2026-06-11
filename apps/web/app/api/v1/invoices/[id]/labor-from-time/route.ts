import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import {
  assertDraftInvoice,
  recalculateInvoiceTotals,
  upsertLaborLineFromTrackedTime,
} from "@/lib/invoices/line-items";
import { logger } from "@/lib/logger";

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

      const labor = await upsertLaborLineFromTrackedTime(
        client,
        invoiceId,
        session.accountId,
        invoice.job_id
      );
      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "labor_from_time", ...labor, totals },
      });

      return {
        line_item: labor.lineItem,
        tracked_minutes: labor.tracked_minutes,
        billable_hours: labor.billable_hours,
        totals,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_ENTITY", message: err.message, traceId: session.traceId } },
        { status: 422 }
      );
    }
    if (err.code === "INVALID_INVOICE" || err.code === "NO_TRACKED_TIME") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 }
      );
    }

    logger.error("POST /api/v1/invoices/[id]/labor-from-time error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to add labor from tracked time", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
