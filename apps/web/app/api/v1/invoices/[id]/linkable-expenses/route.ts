import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { assertDraftInvoice } from "@/lib/invoices/line-items";
import {
  fetchLinkableMaterialExpenses,
  loadJobLinkContext,
} from "@/lib/invoices/job-expenses";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  try {
    const data = await withInvoiceContext(session, async (client) => {
      const invoice = await assertDraftInvoice(client, invoiceId, session.accountId);
      if (!invoice.job_id) {
        throw Object.assign(new Error("Invoice is not linked to a job"), {
          code: "INVALID_INVOICE",
        });
      }

      const job = await loadJobLinkContext(client, session.accountId, invoice.job_id);
      // Include receipts already on this job (ready to bill) AND unlinked client
      // receipts. Filtering out already_on_job hid the common case: past job
      // materials with no path onto the invoice.
      const expenses = await fetchLinkableMaterialExpenses(
        client,
        session.accountId,
        job.id,
        job.client_id,
      );

      return { expenses };
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
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_ENTITY", message: err.message, traceId: session.traceId } },
        { status: 422 },
      );
    }
    if (err.code === "INVALID_INVOICE") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }

    logger.error("GET /api/v1/invoices/[id]/linkable-expenses error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load linkable expenses",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});