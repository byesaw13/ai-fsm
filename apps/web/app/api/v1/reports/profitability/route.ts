import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/v1/reports/profitability?month=YYYY-MM
// Owner/admin only — returns aggregated profitability data for a given month.
// All amounts in cents. Mileage in miles (numeric).
// Expenses and mileage filtered to the selected month; invoice revenue uses created_at bucketing (ADR-014).
export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const { searchParams } = new URL(request.url);
  const month = (searchParams.get("month") ?? "").trim();

  // Default to current month if not provided
  const targetMonth = month && /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Date().toISOString().slice(0, 7);

  // === Revenue: invoices created in the month (ADR-014) ===
  const invoiceRows = await query<{
    status: string;
    count: string;
    total_cents: string;
    paid_cents: string;
  }>(
    `SELECT status,
            COUNT(*)::int as count,
            COALESCE(SUM(total_cents), 0)::bigint as total_cents,
            COALESCE(SUM(paid_cents), 0)::bigint as paid_cents
     FROM invoices
     WHERE account_id = $1
       AND to_char(created_at, 'YYYY-MM') = $2
     GROUP BY status
     ORDER BY status`,
    [session.accountId, targetMonth]
  );

  let revenue_total_cents = 0;
  let revenue_paid_cents = 0;
  let revenue_outstanding_cents = 0;
  for (const row of invoiceRows) {
    const total = Number(row.total_cents);
    const paid = Number(row.paid_cents);
    revenue_total_cents += total;
    revenue_paid_cents += paid;
    if (!["paid", "void"].includes(row.status)) {
      revenue_outstanding_cents += total - paid;
    }
  }

  // === Expenses: by category for the month ===
  const expenseByCategory = await query<{
    category: string;
    count: string;
    total_cents: string;
  }>(
    `SELECT category,
            COUNT(*)::int as count,
            COALESCE(SUM(amount_cents), 0)::bigint as total_cents
     FROM expenses
     WHERE account_id = $1
       AND to_char(expense_date, 'YYYY-MM') = $2
     GROUP BY category
     ORDER BY total_cents DESC`,
    [session.accountId, targetMonth]
  );

  const expenses_total_cents = expenseByCategory.reduce((sum, r) => sum + Number(r.total_cents), 0);

  // === Mileage: total for the month ===
  const mileageRows = await query<{
    trip_count: string;
    total_miles: string;
  }>(
    `SELECT COUNT(*)::int as trip_count,
            COALESCE(SUM(miles), 0)::numeric as total_miles
     FROM mileage_logs
     WHERE account_id = $1
       AND to_char(trip_date, 'YYYY-MM') = $2`,
    [session.accountId, targetMonth]
  );
  const mileage_trip_count = Number(mileageRows[0]?.trip_count ?? 0);
  const mileage_total_miles = Number(mileageRows[0]?.total_miles ?? 0);

  // === Job-level profitability ===
  // Invoice revenue: all-time per job (ADR-015). Expenses and mileage: month-scoped.
  const jobProfitRows = await query<{
    job_id: string;
    job_title: string;
    job_status: string;
    revenue_cents: string;
    paid_cents: string;
    expense_cents: string;
    mileage_miles: string;
    invoice_count: string;
    expense_count: string;
  }>(
    `SELECT
       j.id as job_id,
       j.title as job_title,
       j.status as job_status,
       COALESCE(inv.revenue_cents, 0)::bigint as revenue_cents,
       COALESCE(inv.paid_cents, 0)::bigint as paid_cents,
       COALESCE(exp.expense_cents, 0)::bigint as expense_cents,
       COALESCE(mil.mileage_miles, 0)::numeric as mileage_miles,
       COALESCE(inv.invoice_count, 0)::int as invoice_count,
       COALESCE(exp.expense_count, 0)::int as expense_count
     FROM jobs j
     LEFT JOIN (
       SELECT job_id,
              SUM(total_cents)::bigint as revenue_cents,
              SUM(paid_cents)::bigint as paid_cents,
              COUNT(*)::int as invoice_count
       FROM invoices
       WHERE account_id = $1 AND job_id IS NOT NULL AND status != 'void'
       GROUP BY job_id
     ) inv ON inv.job_id = j.id
     LEFT JOIN (
       SELECT job_id,
              SUM(amount_cents)::bigint as expense_cents,
              COUNT(*)::int as expense_count
       FROM expenses
       WHERE account_id = $1 AND job_id IS NOT NULL
         AND to_char(expense_date, 'YYYY-MM') = $2
       GROUP BY job_id
     ) exp ON exp.job_id = j.id
     LEFT JOIN (
       SELECT job_id,
              SUM(miles)::numeric as mileage_miles
       FROM mileage_logs
       WHERE account_id = $1 AND job_id IS NOT NULL
         AND to_char(trip_date, 'YYYY-MM') = $2
       GROUP BY job_id
     ) mil ON mil.job_id = j.id
     WHERE j.account_id = $1
       AND (inv.revenue_cents IS NOT NULL OR exp.expense_cents IS NOT NULL OR mil.mileage_miles IS NOT NULL)
     ORDER BY COALESCE(inv.revenue_cents, 0) DESC
     LIMIT 50`,
    [session.accountId, targetMonth]
  );

  const net_cents = revenue_paid_cents - expenses_total_cents;

  return NextResponse.json({
    period: { month: targetMonth },
    revenue: {
      total_cents: revenue_total_cents,
      paid_cents: revenue_paid_cents,
      outstanding_cents: revenue_outstanding_cents,
      by_status: invoiceRows.map((r) => ({
        status: r.status,
        count: Number(r.count),
        total_cents: Number(r.total_cents),
        paid_cents: Number(r.paid_cents),
      })),
    },
    expenses: {
      total_cents: expenses_total_cents,
      by_category: expenseByCategory.map((r) => ({
        category: r.category,
        count: Number(r.count),
        total_cents: Number(r.total_cents),
      })),
    },
    mileage: {
      trip_count: mileage_trip_count,
      total_miles: mileage_total_miles,
    },
    net_cents,
    job_profitability: jobProfitRows.map((r) => ({
      job_id: r.job_id,
      job_title: r.job_title,
      job_status: r.job_status,
      revenue_cents: Number(r.revenue_cents),
      paid_cents: Number(r.paid_cents),
      expense_cents: Number(r.expense_cents),
      mileage_miles: Number(r.mileage_miles),
      invoice_count: Number(r.invoice_count),
      expense_count: Number(r.expense_count),
      has_revenue_data: Number(r.invoice_count) > 0,
      has_cost_data: Number(r.expense_count) > 0,
    })),
  });
});
