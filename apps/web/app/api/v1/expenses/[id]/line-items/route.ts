import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { ReceiptRevisionError, saveReceiptRevision } from "@/lib/expenses/receipt-revisions";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const lineItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit_cost_cents: z.number().int().nonnegative(),
  sku: z.string().max(100).nullable().optional(),
  billable: z.boolean().default(true),
});

const adjustmentSchema = z.object({
  kind: z.enum(["return", "discount", "coupon"]),
  name: z.string().max(200),
  amount_cents: z.number().int(),
});

const putBodySchema = z.object({
  line_items: z.array(lineItemSchema).max(100),
  /** "parse" when the lines come straight from a receipt scan; a hand edit otherwise. */
  origin: z.enum(["parse", "edit"]).default("edit"),
  /** From the scan. Omitted on a hand edit: the current revision's values carry forward. */
  tax_cents: z.number().int().nonnegative().nullable().optional(),
  adjustments: z.array(adjustmentSchema).max(50).optional(),
});

export const PUT = withRole(["owner", "admin"], async (request, session) => {
  const expenseId = request.nextUrl.pathname.split("/").at(-2)!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 },
    );
  }

  const parseResult = putBodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid line items",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 },
    );
  }

  try {
    const data = await withExpenseContext(session, async (client) => {
      const body = parseResult.data;
      const saved = await saveReceiptRevision(
        client,
        { accountId: session.accountId, userId: session.userId, traceId: session.traceId },
        expenseId,
        {
          origin: body.origin,
          lineItems: body.line_items.map((li, idx) => ({
            name: li.name,
            quantity: li.quantity,
            unit_cost_cents: li.unit_cost_cents,
            sku: li.sku ?? null,
            sort_order: idx,
            billable: li.billable,
          })),
          taxCents: body.tax_cents,
          adjustments: body.adjustments?.map((a) => ({ ...a, amount_cents: -Math.abs(a.amount_cents) })),
        },
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          action: "edit_line_items",
          revision: saved.revision,
          count: saved.line_items.length,
          catalog_learned: saved.catalog_learned,
          reconciliation: saved.reconciliation,
        },
      });

      return saved;
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error instanceof ReceiptRevisionError ? error : (error as Error & { code?: string });
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Expense not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "ALREADY_BILLED") {
      return NextResponse.json(
        { error: { code: "ALREADY_BILLED", message: err.message, traceId: session.traceId } },
        { status: 409 },
      );
    }

    logger.error("PUT /api/v1/expenses/[id]/line-items error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to save line items", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
