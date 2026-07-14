import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { replaceExpenseLineItems } from "@/lib/expenses/line-items";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@ai-fsm/log/web";

export const dynamic = "force-dynamic";

const lineItemSchema = z.object({
  name: z.string().min(1).max(200),
  quantity: z.number().positive().default(1),
  unit_cost_cents: z.number().int().nonnegative(),
  sku: z.string().max(100).nullable().optional(),
});

const putBodySchema = z.object({
  line_items: z.array(lineItemSchema).max(100),
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
      const expense = await client.query<{ id: string }>(
        `SELECT id FROM expenses WHERE id = $1 AND account_id = $2`,
        [expenseId, session.accountId],
      );
      if ((expense.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Expense not found"), { code: "NOT_FOUND" });
      }

      const billed = await client.query(
        `SELECT 1 AS exists FROM invoice_line_items WHERE source_expense_id = $1 LIMIT 1`,
        [expenseId],
      );
      if ((billed.rowCount ?? 0) > 0) {
        throw Object.assign(
          new Error("This receipt is already on an invoice — edit the invoice instead"),
          { code: "ALREADY_BILLED" },
        );
      }

      const saved = await replaceExpenseLineItems(
        client,
        session.accountId,
        expenseId,
        parseResult.data.line_items.map((li, idx) => ({
          name: li.name,
          quantity: li.quantity,
          unit_cost_cents: li.unit_cost_cents,
          sku: li.sku ?? null,
          sort_order: idx,
        })),
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "edit_line_items", count: saved.length },
      });

      return { line_items: saved };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
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
