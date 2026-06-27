import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import {
  assertDraftInvoice,
  createInvoiceLineItem,
  INVOICE_LINE_ITEM_TYPES,
  recalculateInvoiceTotals,
} from "@/lib/invoices/line-items";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const lineItemSchema = z
  .object({
    description: z.string().trim().min(1).max(500),
    quantity: z.coerce.number().positive().max(999999.99),
    unit_price_cents: z.coerce.number().int().min(-100_000_000).max(100_000_000),
    line_item_type: z.enum(INVOICE_LINE_ITEM_TYPES).default("labor"),
  })
  // Only 'adjustment' lines may be negative — that's how a discount is entered.
  .refine((d) => d.line_item_type === "adjustment" || d.unit_price_cents >= 0, {
    message: "Only an adjustment line can be negative (use one as a discount).",
    path: ["unit_price_cents"],
  });

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = lineItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    const data = await withInvoiceContext(session, async (client) => {
      await assertDraftInvoice(client, invoiceId, session.accountId);
      const lineItem = await createInvoiceLineItem(client, invoiceId, parsed.data);
      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "line_item_insert", line_item: lineItem, totals },
      });

      return { line_item: lineItem, totals };
    });

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return handleLineItemError(error, session.traceId, "POST /api/v1/invoices/[id]/line-items");
  }
});

function handleLineItemError(error: unknown, traceId: string, logLabel: string) {
  const err = error as Error & { code?: string };
  if (err.code === "NOT_FOUND") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Invoice not found", traceId } },
      { status: 404 }
    );
  }
  if (err.code === "IMMUTABLE_ENTITY") {
    return NextResponse.json(
      { error: { code: "IMMUTABLE_ENTITY", message: err.message, traceId } },
      { status: 422 }
    );
  }

  logger.error(`${logLabel} error`, error, { traceId });
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Failed to update invoice line items", traceId } },
    { status: 500 }
  );
}
