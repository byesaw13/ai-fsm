import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { replaceExpenseLineItems } from "@/lib/expenses/line-items";
import { learnMaterialsFromLineItems } from "@/lib/materials/catalog";
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
      const expense = await client.query<{
        id: string;
        category: string;
        vendor_name: string;
        expense_date: string;
      }>(
        `SELECT id, category, vendor_name, expense_date::text AS expense_date
         FROM expenses WHERE id = $1 AND account_id = $2`,
        [expenseId, session.accountId],
      );
      if ((expense.rowCount ?? 0) === 0) {
        throw Object.assign(new Error("Expense not found"), { code: "NOT_FOUND" });
      }

      const exp = expense.rows[0];

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

      // Non-fatal: materials receipts teach the SKU/price catalog.
      // Use a savepoint so a PG error does not abort the outer expense transaction.
      let catalog_learned = 0;
      if (exp.category === "materials" && saved.length > 0) {
        try {
          await client.query("SAVEPOINT materials_catalog_learn");
          try {
            const { learned } = await learnMaterialsFromLineItems(
              client,
              {
                accountId: session.accountId,
                supplier: exp.vendor_name,
                purchasedAt: exp.expense_date?.slice(0, 10) ?? null,
              },
              saved.map((li) => ({
                name: li.name,
                unit_cost_cents: li.unit_cost_cents,
                sku: li.sku,
                quantity: li.quantity,
              })),
            );
            catalog_learned = learned;
            await client.query("RELEASE SAVEPOINT materials_catalog_learn");
          } catch (learnErr) {
            await client.query("ROLLBACK TO SAVEPOINT materials_catalog_learn");
            await client.query("RELEASE SAVEPOINT materials_catalog_learn");
            logger.warn("materials catalog learn failed (non-fatal)", {
              error: learnErr instanceof Error ? learnErr.message : String(learnErr),
              expenseId,
              traceId: session.traceId,
            });
          }
        } catch (spErr) {
          logger.warn("materials catalog learn savepoint failed (non-fatal)", {
            error: spErr instanceof Error ? spErr.message : String(spErr),
            expenseId,
            traceId: session.traceId,
          });
        }
      }

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: expenseId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          action: "edit_line_items",
          count: saved.length,
          catalog_learned,
        },
      });

      return { line_items: saved, catalog_learned };
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
