import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withExpenseContext } from "@/lib/expenses/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { isValidMonthKey } from "@/lib/expenses/ui";
import { expenseCategorySchema } from "@ai-fsm/domain";
import { attachFuelExpenseToVehicle } from "@/lib/expenses/attach-fuel-expense";
import { gallonsFromParsedReceipt } from "@/lib/expenses/fuel-from-receipt";
import {
  expenseDateKey,
  findMatchingExpense,
} from "@/lib/expenses/duplicate-match";

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
  vehicle_id: z.string().uuid().nullable().optional(),
  gallons: z.number().positive().max(500).nullable().optional(),
  odometer: z.number().int().positive().nullable().optional(),
  external_ref: z.string().min(1).max(80).nullable().optional(),
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

  const {
    vendor_name,
    category,
    amount_cents,
    expense_date,
    job_id,
    client_id,
    notes,
    vehicle_id,
    gallons,
    odometer,
    external_ref,
  } = parseResult.data;

  try {
    const created = await withExpenseContext(session, async (client) => {
      const sameDay = await client.query<{
        id: string;
        vendor_name: string;
        amount_cents: number;
        expense_date: string | Date;
        external_ref: string | null;
        source: string | null;
      }>(
        `SELECT id, vendor_name, amount_cents, expense_date, external_ref, source
         FROM expenses
         WHERE account_id = $1 AND expense_date = $2::date`,
        [session.accountId, expense_date],
      );
      const matched = findMatchingExpense(
        {
          vendor_name,
          expense_date,
          amount_cents,
          external_ref: external_ref ?? null,
        },
        sameDay.rows.map((row) => ({
          id: row.id,
          vendor_name: row.vendor_name,
          amount_cents: row.amount_cents,
          expense_date: expenseDateKey(row.expense_date),
          external_ref: row.external_ref,
          source: row.source,
        })),
      );

      if (matched?.id) {
        const before = await client.query<{
          amount_cents: number;
          job_id: string | null;
          client_id: string | null;
          external_ref: string | null;
        }>(
          `SELECT amount_cents, job_id, client_id, external_ref
           FROM expenses WHERE id = $1 AND account_id = $2`,
          [matched.id, session.accountId],
        );
        const oldRow = before.rows[0];
        await client.query(
          `UPDATE expenses SET
             external_ref = COALESCE(external_ref, $3),
             job_id = COALESCE(job_id, $4),
             client_id = COALESCE(client_id, $5),
             amount_cents = GREATEST(amount_cents, $6),
             updated_at = now()
           WHERE id = $1 AND account_id = $2`,
          [
            matched.id,
            session.accountId,
            external_ref ?? null,
            job_id ?? null,
            client_id ?? null,
            amount_cents,
          ],
        );
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "expense",
          entity_id: matched.id,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: oldRow ?? null,
          new_value: {
            merged_from: "photo_save",
            amount_cents,
            job_id: job_id ?? null,
            client_id: client_id ?? null,
            external_ref: external_ref ?? null,
          },
        });
        return { id: matched.id, merged: true, vehicleId: null, fuelLogId: null };
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO expenses
           (account_id, vendor_name, category, amount_cents, expense_date,
            job_id, client_id, notes, created_by, external_ref)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10)
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
          external_ref ?? null,
        ]
      );

      const id = result.rows[0].id;

      const fuel = await attachFuelExpenseToVehicle(client, {
        accountId: session.accountId,
        userId: session.userId,
        expenseId: id,
        category,
        expenseDate: expense_date,
        notes: notes ?? null,
        gallons:
          gallons ??
          gallonsFromParsedReceipt({
            category,
            notes: notes ?? null,
            amountCents: amount_cents,
          }),
        amountCents: amount_cents,
        odometer: odometer ?? null,
        vehicleId: vehicle_id ?? null,
      });

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "expense",
        entity_id: id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          vendor_name,
          category,
          amount_cents,
          expense_date,
          vehicle_id: fuel.vehicleId,
          fuel_log_id: fuel.fuelLogId,
        },
      });

      return { id, merged: false, vehicleId: fuel.vehicleId, fuelLogId: fuel.fuelLogId };
    });

    return NextResponse.json(
      {
        id: created.id,
        merged: created.merged,
        vehicle_id: created.vehicleId,
        fuel_log_id: created.fuelLogId,
      },
      { status: created.merged ? 200 : 201 },
    );
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
