import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { expenseCategorySchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// === Get Expense (GET /api/v1/expenses/[id]) ===

export const GET = withAuth(async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

  try {
    const data = await withExpenseContext(session, async (client) => {
      const result = await client.query(
        `SELECT e.id, e.vendor_name, e.category, e.amount_cents,
                e.expense_date, e.job_id, e.client_id, e.property_id,
                e.notes, e.receipt_url, e.created_by, e.created_at, e.updated_at,
                j.title AS job_title, c.name AS client_name
         FROM expenses e
         LEFT JOIN jobs j ON j.id = e.job_id
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE e.id = $1 AND e.account_id = $2`,
        [id, session.accountId]
      );

      return result.rowCount === 0 ? null : result.rows[0];
    });

    if (!data) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Expense not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/expenses/[id] error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch expense",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Update Expense (PATCH /api/v1/expenses/[id]) ===

const updateExpenseSchema = z.object({
  vendor_name: z.string().min(1).max(200).optional(),
  category: expenseCategorySchema.optional(),
  amount_cents: z.number().int().positive().optional(),
  expense_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  job_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-1)!;

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
      { status: 400 }
    );
  }

  const parseResult = updateExpenseSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const updates = parseResult.data;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "No fields to update",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    await withExpenseContext(session, async (client) => {
      const existing = await client.query<{ id: string; vendor_name: string }>(
        `SELECT id, vendor_name FROM expenses WHERE id = $1 AND account_id = $2`,
        [id, session.accountId]
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Expense not found"), {
          code: "NOT_FOUND",
        });
      }

      const setClauses: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      const allowed = [
        "vendor_name",
        "category",
        "amount_cents",
        "job_id",
        "client_id",
        "notes",
      ] as const;

      for (const key of allowed) {
        if (key in updates) {
          setClauses.push(`${key} = $${idx++}`);
          params.push(updates[key] ?? null);
        }
      }

      // expense_date needs ::date cast
      if ("expense_date" in updates && updates.expense_date !== undefined) {
        setClauses.push(`expense_date = $${idx++}::date`);
        params.push(updates.expense_date);
      }

      setClauses.push(`updated_at = now()`);
      params.push(id, session.accountId);

      await client.query(
        `UPDATE expenses SET ${setClauses.join(", ")}
         WHERE id = $${idx} AND account_id = $${idx + 1}`,
        params
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { vendor_name: existing.rows[0].vendor_name },
        new_value: updates,
      });
    });

    return NextResponse.json({ updated: true });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Expense not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    logger.error("PATCH /api/v1/expenses/[id] error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to update expense",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
