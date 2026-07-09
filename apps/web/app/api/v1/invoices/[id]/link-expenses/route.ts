import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import { assertDraftInvoice, recalculateInvoiceTotals } from "@/lib/invoices/line-items";
import { linkAndAppendMaterialsToInvoice } from "@/lib/invoices/job-expenses";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  expense_ids: z.array(z.string().uuid()).min(1).max(20),
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "expense_ids must be a non-empty array of UUIDs",
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  try {
    const data = await withInvoiceContext(session, async (client) => {
      const invoice = await assertDraftInvoice(client, invoiceId, session.accountId);
      if (!invoice.job_id) {
        throw Object.assign(new Error("Invoice is not linked to a job"), {
          code: "INVALID_INVOICE",
        });
      }

      const { linked, lineItems } = await linkAndAppendMaterialsToInvoice(
        client,
        invoiceId,
        session.accountId,
        invoice.job_id,
        parsed.data.expense_ids,
      );

      if (lineItems.length === 0) {
        throw Object.assign(new Error("No expenses were linked or added to the invoice"), {
          code: "NO_EXPENSES_LINKED",
        });
      }

      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          action: "link_expenses",
          linked,
          added: lineItems.length,
          totals,
        },
      });

      return { linked, line_items: lineItems, totals };
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
    if (
      err.code === "INVALID_INVOICE" ||
      err.code === "NO_EXPENSES_LINKED" ||
      err.code === "INVALID_EXPENSE" ||
      err.code === "EXPENSE_ON_OTHER_JOB" ||
      err.code === "EXPENSE_ALREADY_BILLED"
    ) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }

    logger.error("POST /api/v1/invoices/[id]/link-expenses error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to link expenses to invoice",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});