import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { isValidMonthKey } from "@/lib/expenses/ui";
import { expenseCategorySchema } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// === List Expenses (GET /api/v1/expenses) ===

const listQuerySchema = z.object({
  category: expenseCategorySchema.optional(),
  job_id: z.string().uuid().optional(),
  month: z
    .string()
    .refine(isValidMonthKey, "Month must be a valid YYYY-MM value")
    .optional(), // e.g. "2026-03"
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = listQuerySchema.safeParse({
    category: searchParams.get("category") ?? undefined,
    job_id: searchParams.get("job_id") ?? undefined,
    month: searchParams.get("month") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { category, job_id, month, page, limit } = parseResult.data;
  const offset = (page - 1) * limit;

  try {
    const result = await withExpenseContext(session, async (client) => {
      const conditions: string[] = ["e.account_id = $1"];
      const params: unknown[] = [session.accountId];
      let idx = 2;

      if (category) {
        conditions.push(`e.category = $${idx++}`);
        params.push(category);
      }
      if (job_id) {
        conditions.push(`e.job_id = $${idx++}`);
        params.push(job_id);
      }
      if (month) {
        // month format: "2026-03" → filter expense_date in that month
        conditions.push(
          `e.expense_date >= $${idx++}::date AND e.expense_date < ($${idx++}::date + interval '1 month')`
        );
        params.push(`${month}-01`, `${month}-01`);
      }

      const where = conditions.join(" AND ");

      const countResult = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total FROM expenses e WHERE ${where}`,
        [...params]
      );
      const total = parseInt(countResult.rows[0]?.total ?? "0", 10);

      const rows = await client.query(
        `SELECT e.id, e.vendor_name, e.category, e.amount_cents,
                e.expense_date, e.job_id, e.client_id, e.property_id,
                e.notes, e.receipt_url, e.created_by, e.created_at, e.updated_at,
                j.title AS job_title, c.name AS client_name
         FROM expenses e
         LEFT JOIN jobs j ON j.id = e.job_id
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE ${where}
         ORDER BY e.expense_date DESC, e.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );

      const summaryMonth = month ?? new Date().toISOString().slice(0, 7);

      // Summary totals for the requested month, ignoring list-only filters like category/job.
      const summaryResult = await client.query<{
        current_month_total: string | null;
        current_month_count: string;
      }>(
        `SELECT
           SUM(amount_cents) AS current_month_total,
           COUNT(*) AS current_month_count
         FROM expenses
         WHERE account_id = $1
           AND expense_date >= $2::date
           AND expense_date < ($2::date + interval '1 month')`,
        [session.accountId, `${summaryMonth}-01`]
      );

      const categoryTotals = await client.query<{
        category: string;
        total_cents: string;
      }>(
        `SELECT category, SUM(amount_cents) AS total_cents
         FROM expenses
         WHERE account_id = $1
           AND expense_date >= $2::date
           AND expense_date < ($2::date + interval '1 month')
         GROUP BY category
         ORDER BY total_cents DESC`,
        [session.accountId, `${summaryMonth}-01`]
      );

      return {
        rows: rows.rows,
        total,
        summary: {
          current_month_total_cents: parseInt(
            summaryResult.rows[0]?.current_month_total ?? "0",
            10
          ),
          current_month_count: parseInt(
            summaryResult.rows[0]?.current_month_count ?? "0",
            10
          ),
          category_totals: categoryTotals.rows.map((r) => ({
            category: r.category,
            total_cents: parseInt(r.total_cents, 10),
          })),
        },
      };
    });

    return NextResponse.json({
      data: result.rows,
      pagination: { page, limit, total: result.total },
      summary: result.summary,
    });
  } catch (error) {
    logger.error("GET /api/v1/expenses error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch expenses",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Create Expense (POST /api/v1/expenses) ===

const createExpenseSchema = z.object({
  vendor_name: z.string().min(1).max(200),
  category: expenseCategorySchema,
  amount_cents: z.number().int().positive(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  job_id: z.string().uuid().nullable().optional(),
  client_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
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

  const parseResult = createExpenseSchema.safeParse(body);
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

  const { vendor_name, category, amount_cents, expense_date, job_id, client_id, notes } =
    parseResult.data;

  try {
    const expenseId = await withExpenseContext(session, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO expenses
           (account_id, vendor_name, category, amount_cents, expense_date,
            job_id, client_id, notes, created_by)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9)
         RETURNING id`,
        [
          session.accountId,
          vendor_name,
          category,
          amount_cents,
          expense_date,
          job_id ?? null,
          client_id ?? null,
          notes ?? null,
          session.userId,
        ]
      );

      const id = result.rows[0].id;

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { vendor_name, category, amount_cents, expense_date },
      });

      return id;
    });

    return NextResponse.json({ id: expenseId }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/v1/expenses error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create expense",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
