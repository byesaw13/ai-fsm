import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import {
  assertDraftInvoice,
  INVOICE_LINE_ITEM_TYPES,
  recalculateInvoiceTotals,
  updateInvoiceLineItem,
} from "@/lib/invoices/line-items";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.coerce.number().positive().max(999999.99),
  unit_price_cents: z.coerce.number().int().min(0).max(100_000_000),
  line_item_type: z.enum(INVOICE_LINE_ITEM_TYPES),
});

function getIds(pathname: string): { invoiceId: string; lineItemId: string } {
  // .../invoices/{invoiceId}/line-items/{lineItemId}
  //   at(-1)=lineItemId, at(-2)="line-items", at(-3)=invoiceId, at(-4)="invoices"
  const parts = pathname.split("/");
  return {
    invoiceId: parts.at(-3)!,
    lineItemId: parts.at(-1)!,
  };
}

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const { invoiceId, lineItemId } = getIds(request.nextUrl.pathname);

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
      const lineItem = await updateInvoiceLineItem(client, invoiceId, lineItemId, parsed.data);
      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "line_item_update", line_item: lineItem, totals },
      });

      return { line_item: lineItem, totals };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleLineItemError(error, session.traceId, "PATCH /api/v1/invoices/[id]/line-items/[lineItemId]");
  }
});

export const DELETE = withRole(["owner", "admin"], async (request, session) => {
  const { invoiceId, lineItemId } = getIds(request.nextUrl.pathname);

  try {
    const data = await withInvoiceContext(session, async (client) => {
      await assertDraftInvoice(client, invoiceId, session.accountId);

      const deleted = await client.query<{ id: string; description: string }>(
        `DELETE FROM invoice_line_items
         WHERE id = $1 AND invoice_id = $2
         RETURNING id, description`,
        [lineItemId, invoiceId]
      );
      if ((deleted.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Line item not found"), { code: "NOT_FOUND" });
      }

      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "line_item_delete", line_item: deleted.rows[0], totals },
      });

      return { deleted: true, totals };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleLineItemError(error, session.traceId, "DELETE /api/v1/invoices/[id]/line-items/[lineItemId]");
  }
});

function handleLineItemError(error: unknown, traceId: string, logLabel: string) {
  const err = error as Error & { code?: string };
  if (err.code === "NOT_FOUND") {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: err.message, traceId } },
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
