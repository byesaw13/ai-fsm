import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canViewReports } from "@/lib/auth/permissions";
import { query } from "@/lib/db";
import {
  Card,
  EmptyState,
  FilterBar,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import type { FilterDef } from "@/components/ui";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InvoiceStatusRow = {
  status: string;
  count: number;
  total_cents: string;
  paid_cents: string;
};

type ExpenseCategoryRow = {
  category: string;
  count: number;
  total_cents: string;
};

type MileageSummary = {
  trip_count: number;
  total_miles: string;
};

type JobProfitRow = {
  job_id: string;
  job_title: string;
  job_status: string;
  revenue_cents: string;
  paid_cents: string;
  expense_cents: string;
  mileage_miles: string;
  invoice_count: number;
  expense_count: number;
};

type EstimateMarginRow = {
  estimate_id: string;
  estimate_status: string;
  client_name: string | null;
  job_title: string | null;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  internal_labor_cost_cents: number | null;
  internal_material_cost_cents: number | null;
  sq_ft: number | null;
  prep_level: number | null;
  created_at: string;
};

type RevenueByJobTypeRow = {
  job_type: string;
  job_count: number;
  revenue_cents: string;
  paid_cents: string;
  avg_job_cents: string;
};

type TechPerformanceRow = {
  user_id: string;
  user_name: string;
  visits_completed: number;
  total_visits: number;
  completion_rate: string;
  avg_visits_per_tech: string;
};

type EstimateConversionRow = {
  status: string;
  count: number;
  pct_of_total: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number | string): string {
  const n = Number(cents);
  return n < 0
    ? `-$${Math.abs(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    materials: "Materials",
    tools: "Tools",
    fuel: "Fuel",
    vehicle: "Vehicle",
    subcontractors: "Subcontractors",
    office: "Office",
    insurance: "Insurance",
    utilities: "Utilities",
    marketing: "Marketing",
    meals: "Meals",
    travel: "Travel",
    other: "Other",
  };
  return labels[cat] ?? cat;
}

function statusLabel(s: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    sent: "Sent",
    partial: "Partial",
    paid: "Paid",
    overdue: "Overdue",
    void: "Void",
  };
  return labels[s] ?? s;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

const REPORT_FILTERS: FilterDef[] = [
  { name: "month", type: "text", label: "Month", placeholder: "2026-03" },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canViewReports(session.role)) redirect("/app");

  const { month } = await searchParams;
  const today = new Date().toISOString().slice(0, 7);
  const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : today;

  // === Revenue: invoices created in the month ===
  const invoiceStatuses = await query<InvoiceStatusRow>(
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
  for (const row of invoiceStatuses) {
    const total = Number(row.total_cents);
    const paid = Number(row.paid_cents);
    revenue_total_cents += total;
    revenue_paid_cents += paid;
    if (!["paid", "void"].includes(row.status)) {
      revenue_outstanding_cents += total - paid;
    }
  }

  // === Expenses: by category for the month ===
  const expensesByCategory = await query<ExpenseCategoryRow>(
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

  const expenses_total_cents = expensesByCategory.reduce((sum, r) => sum + Number(r.total_cents), 0);

  // === Mileage: for the month ===
  const mileageRows = await query<MileageSummary>(
    `SELECT COUNT(*)::int as trip_count,
            COALESCE(SUM(miles), 0)::numeric as total_miles
     FROM vehicle_sessions
     WHERE account_id = $1
       AND to_char(session_date, 'YYYY-MM') = $2`,
    [session.accountId, targetMonth]
  );
  const mileage_trip_count = Number(mileageRows[0]?.trip_count ?? 0);
  const mileage_total_miles = Number(mileageRows[0]?.total_miles ?? 0);

  // === Job profitability: invoices (all-time) + expenses + mileage (month-scoped) ===
  const jobProfitRows = await query<JobProfitRow>(
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
       SELECT a.entity_id AS job_id,
              SUM(s.miles)::numeric as mileage_miles
       FROM vehicle_sessions s
       JOIN vehicle_session_activities a ON a.session_id = s.id
       WHERE s.account_id = $1 AND a.entity_type = 'job' AND a.entity_id IS NOT NULL
         AND to_char(s.session_date, 'YYYY-MM') = $2
       GROUP BY a.entity_id
     ) mil ON mil.job_id = j.id
     WHERE j.account_id = $1
       AND (inv.revenue_cents IS NOT NULL OR exp.expense_cents IS NOT NULL OR mil.mileage_miles IS NOT NULL)
     ORDER BY COALESCE(inv.revenue_cents, 0) DESC
     LIMIT 50`,
    [session.accountId, targetMonth]
  );

  const net_cents = revenue_paid_cents - expenses_total_cents;
  const hasAnyData = revenue_total_cents > 0 || expenses_total_cents > 0 || mileage_trip_count > 0;

  // === Estimate margins: recent estimates with internal cost data ===
  const estimateMarginRows = await query<EstimateMarginRow>(
    `SELECT e.id as estimate_id, e.status as estimate_status,
            e.total_cents, e.deposit_cents, e.balance_cents,
            e.internal_labor_cost_cents, e.internal_material_cost_cents,
            e.sq_ft, e.prep_level, e.created_at,
            c.name as client_name, j.title as job_title
     FROM estimates e
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN jobs j ON j.id = e.job_id
     WHERE e.account_id = $1
       AND e.internal_labor_cost_cents IS NOT NULL
       AND e.status IN ('sent', 'approved')
     ORDER BY e.created_at DESC
     LIMIT 20`,
    [session.accountId]
  );

  // === Revenue by job type (month-scoped) ===
  const revenueByJobType = await query<RevenueByJobTypeRow>(
    `SELECT j.job_type,
            COUNT(DISTINCT j.id)::int as job_count,
            COALESCE(SUM(inv.total_cents), 0)::bigint as revenue_cents,
            COALESCE(SUM(inv.paid_cents), 0)::bigint as paid_cents,
            CASE WHEN COUNT(DISTINCT j.id) > 0
              THEN (COALESCE(SUM(inv.total_cents), 0) / COUNT(DISTINCT j.id))::bigint
              ELSE 0
            END as avg_job_cents
     FROM jobs j
     LEFT JOIN invoices inv ON inv.job_id = j.id AND inv.status != 'void'
     WHERE j.account_id = $1
       AND j.job_type IS NOT NULL
       AND (to_char(j.created_at, 'YYYY-MM') = $2 OR to_char(inv.created_at, 'YYYY-MM') = $2)
     GROUP BY j.job_type
     ORDER BY revenue_cents DESC`,
    [session.accountId, targetMonth]
  );

  // === Tech performance (month-scoped) ===
  const techPerformance = await query<TechPerformanceRow>(
    `SELECT u.id as user_id,
            u.full_name as user_name,
            COUNT(*) FILTER (WHERE v.status = 'completed')::int as visits_completed,
            COUNT(*)::int as total_visits,
            ROUND(
              CASE WHEN COUNT(*) > 0
                THEN (COUNT(*) FILTER (WHERE v.status = 'completed')::numeric / COUNT(*) * 100)
                ELSE 0
              END, 1
            ) as completion_rate,
            ROUND(
              AVG(COUNT(*) FILTER (WHERE v.status = 'completed')) OVER (), 1
            ) as avg_visits_per_tech
     FROM visits v
     JOIN users u ON u.id = v.assigned_user_id
     WHERE v.account_id = $1
       AND to_char(v.scheduled_start, 'YYYY-MM') = $2
       AND u.role = 'tech'
     GROUP BY u.id, u.full_name
     ORDER BY visits_completed DESC`,
    [session.accountId, targetMonth]
  );

  // === Estimate conversion funnel (all-time, but can be scoped to month) ===
  const estimateConversion = await query<EstimateConversionRow>(
    `SELECT status,
            COUNT(*)::int as count,
            ROUND(
              COUNT(*)::numeric / NULLIF(SUM(COUNT(*)) OVER (), 0) * 100, 1
            ) as pct_of_total
     FROM estimates
     WHERE account_id = $1
       AND to_char(created_at, 'YYYY-MM') = $2
     GROUP BY status
     ORDER BY
       CASE status
         WHEN 'draft' THEN 1
         WHEN 'sent' THEN 2
         WHEN 'approved' THEN 3
         WHEN 'declined' THEN 4
         WHEN 'expired' THEN 5
         ELSE 6
       END`,
    [session.accountId, targetMonth]
  );

  const currentValues: Record<string, string> = {};
  if (month) currentValues.month = month;

  const [year, mon] = targetMonth.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  // Derived metrics
  const totalEstimates = estimateConversion.reduce((sum, r) => sum + r.count, 0);
  const approvedEstimates = estimateConversion.find((r) => r.status === "approved")?.count ?? 0;
  const conversionRate = totalEstimates > 0 ? Math.round((approvedEstimates / totalEstimates) * 100) : 0;
  const totalJobs = jobProfitRows.length;

  return (
    <PageContainer>
      <PageHeader
        title="Profitability"
        subtitle={monthLabel}
        actions={
          <Link href={"/app/reports/close" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>
            Month-End Close →
          </Link>
        }
      />

      {/* Month filter */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <FilterBar filters={REPORT_FILTERS} baseHref="/app/reports" currentValues={currentValues} />
      </div>

      {/* KPI summary */}
      <MetricGrid
        metrics={[
          {
            label: "Revenue (Paid)",
            value: formatCents(revenue_paid_cents),
            variant: revenue_paid_cents > 0 ? "success" : "default",
          },
          {
            label: "Total Expenses",
            value: formatCents(expenses_total_cents),
            variant: expenses_total_cents > 0 ? "alert" : "default",
          },
          {
            label: "Net (Paid − Expenses)",
            value: formatCents(net_cents),
            variant: net_cents < 0 ? "alert" : net_cents > 0 ? "success" : "default",
          },
          {
            label: "Outstanding AR",
            value: formatCents(revenue_outstanding_cents),
            variant: revenue_outstanding_cents > 0 ? "alert" : "default",
          },
          {
            label: "Estimate Conversion",
            value: `${conversionRate}%`,
            variant: conversionRate >= 30 ? "success" : conversionRate > 0 ? "default" : "alert",
          },
          {
            label: "Active Jobs",
            value: String(totalJobs),
            variant: "default",
          },
        ]}
      />

      {!hasAnyData ? (
        <div style={{ marginTop: "var(--space-6)" }}>
          <EmptyState
            title={`No data for ${monthLabel}`}
            description="Create invoices, log expenses, or record mileage to see profitability data."
            action={<Link href={"/app/expenses/new" as Route} style={{ color: "var(--accent)" }}>Add Expense</Link>}
            data-testid="reports-empty"
          />
        </div>
      ) : (
        <>
          {/* === Estimate Conversion Funnel === */}
          {estimateConversion.length > 0 && (
            <Card>
              <SectionHeader title="Estimate Conversion Funnel" />
              <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                How estimates move through the pipeline for {monthLabel}. Target: 30%+ conversion rate.
              </p>
              <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>
                <div style={{ display: "flex", alignItems: "stretch", gap: 4, marginBottom: 12 }}>
                  {estimateConversion.map((row) => {
                    const colors: Record<string, string> = {
                      draft: "var(--fg-muted)",
                      sent: "#60a5fa",
                      approved: "var(--status-success)",
                      declined: "var(--status-error)",
                      expired: "var(--status-warning)",
                    };
                    return (
                      <div
                        key={row.status}
                        style={{
                          flex: row.count,
                          background: colors[row.status] ?? "var(--border)",
                          borderRadius: 4,
                          padding: "8px 6px",
                          textAlign: "center",
                          color: "#fff",
                          fontSize: "var(--text-xs)",
                          fontWeight: 600,
                          minWidth: 40,
                        }}
                        title={`${row.status}: ${row.count} (${row.pct_of_total}%)`}
                      >
                        <div style={{ fontSize: "var(--text-xs)", textTransform: "capitalize" }}>{row.status}</div>
                        <div style={{ fontSize: 18 }}>{row.count}</div>
                        <div style={{ fontSize: 10, opacity: 0.8 }}>{row.pct_of_total}%</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                  <span>Total: {totalEstimates} estimates</span>
                  <span style={{ color: conversionRate >= 30 ? "var(--status-success)" : conversionRate > 0 ? "var(--status-warning)" : "var(--status-error)" }}>
                    Conversion rate: {conversionRate}%
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* === Revenue by Job Type === */}
          {revenueByJobType.length > 0 && (
            <Card style={{ marginTop: "var(--space-4)" }}>
              <SectionHeader title="Revenue by Job Type" />
              <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                Revenue attributed to jobs created or invoiced in {monthLabel}, grouped by type.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Job Type</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Jobs</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Revenue</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Collected</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Avg/Job</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueByJobType.map((row) => {
                    const typeLabels: Record<string, string> = {
                      painting: "Painting",
                      maintenance: "Maintenance",
                      repair: "Repair",
                      custom: "Custom",
                    };
                    return (
                      <tr key={row.job_type} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600, textTransform: "capitalize" }}>
                          {typeLabels[row.job_type] ?? row.job_type}
                        </td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.job_count}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(row.revenue_cents)}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(row.paid_cents)}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", color: "var(--fg-muted)" }}>{formatCents(row.avg_job_cents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {/* === Tech Performance === */}
          {techPerformance.length > 0 && (
            <Card style={{ marginTop: "var(--space-4)" }}>
              <SectionHeader title="Tech Performance" />
              <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                Visit completion stats for technicians in {monthLabel}.
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Technician</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Completed</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Total</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Completion Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {techPerformance.map((row) => {
                    const rate = parseFloat(row.completion_rate);
                    const rateColor = rate >= 80 ? "var(--status-success)" : rate >= 50 ? "var(--status-warning)" : "var(--status-error)";
                    return (
                      <tr key={row.user_id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600 }}>{row.user_name}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.visits_completed}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.total_visits}</td>
                        <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 700, color: rateColor }}>
                          {row.completion_rate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
          {/* === Revenue Section === */}
          <Card style={{ marginTop: "var(--space-6)" }}>
            <SectionHeader title="Revenue" />
            {invoiceStatuses.length === 0 ? (
              <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", padding: "var(--space-3)" }}>
                No invoices created this month.
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Status</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Count</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Invoiced</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceStatuses.map((row) => (
                    <tr key={row.status} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>{statusLabel(row.status)}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.count}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(row.total_cents)}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 600 }}>{formatCents(row.paid_cents)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>Total</td>
                    <td />
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(revenue_total_cents)}</td>
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(revenue_paid_cents)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <div style={{ marginTop: "var(--space-2)", padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>
              <Link href={"/app/invoices" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-xs)" }}>
                View all invoices →
              </Link>
            </div>
          </Card>

          {/* === Expenses Section === */}
          <Card style={{ marginTop: "var(--space-4)" }}>
            <SectionHeader title="Expenses by Category" />
            {expensesByCategory.length === 0 ? (
              <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", padding: "var(--space-3)" }}>
                No expenses recorded this month.{" "}
                <Link href={"/app/expenses/new" as Route} style={{ color: "var(--accent)" }}>
                  Add one now.
                </Link>
              </p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Category</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Count</th>
                    <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {expensesByCategory.map((row) => (
                    <tr key={row.category} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>{categoryLabel(row.category)}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.count}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 600 }}>{formatCents(row.total_cents)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                    <td style={{ padding: "var(--space-2) var(--space-3)" }}>Total</td>
                    <td />
                    <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(expenses_total_cents)}</td>
                  </tr>
                </tbody>
              </table>
            )}
            <div style={{ marginTop: "var(--space-2)", padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>
              <Link href={"/app/expenses" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-xs)" }}>
                View all expenses →
              </Link>
            </div>
          </Card>

          {/* === Mileage Section === */}
          <Card style={{ marginTop: "var(--space-4)" }}>
            <SectionHeader title="Mileage" />
            <div style={{ padding: "var(--space-3)", display: "flex", gap: "var(--space-6)", fontSize: "var(--text-sm)" }}>
              <div>
                <div style={{ color: "var(--fg-muted)" }}>Total Miles</div>
                <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{mileage_total_miles.toFixed(1)}</div>
              </div>
              <div>
                <div style={{ color: "var(--fg-muted)" }}>Trips</div>
                <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{mileage_trip_count}</div>
              </div>
            </div>
          </Card>

          {/* === Job Profitability Section === */}
          {jobProfitRows.length > 0 && (
            <Card style={{ marginTop: "var(--space-4)" }}>
              <SectionHeader title="Job Profitability" />
              <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                Revenue = all non-void invoices linked to job (any date). Expenses and mileage filtered to {monthLabel}.
                Jobs without linked invoices show partial data — marked with *.
              </p>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", minWidth: 600 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Job</th>
                      <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Revenue</th>
                      <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Expenses</th>
                      <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Miles</th>
                      <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobProfitRows.map((row) => {
                      const revenue = Number(row.revenue_cents);
                      const expenses = Number(row.expense_cents);
                      const net = revenue - expenses;
                      const hasAllData = Number(row.invoice_count) > 0;
                      return (
                        <tr key={row.job_id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                            <Link
                              href={`/app/jobs/${row.job_id}` as Route}
                              style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                            >
                              {row.job_title}
                              {!hasAllData && (
                                <span style={{ color: "var(--fg-muted)", fontWeight: 400, fontSize: "var(--text-xs)" }}> *</span>
                              )}
                            </Link>
                            <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{row.job_status}</div>
                          </td>
                          <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(revenue)}</td>
                          <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(expenses)}</td>
                          <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{Number(row.mileage_miles).toFixed(1)}</td>
                          <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 700, color: net < 0 ? "var(--status-error)" : "inherit" }}>
                            {formatCents(net)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                * Incomplete profitability — no invoice linked to this job.
              </p>
            </Card>
          )}

        </>
      )}

      {/* Estimate Margins — not month-scoped; shows whenever cost-tracked estimates exist */}
      {estimateMarginRows.length > 0 && (
        <Card style={{ marginTop: "var(--space-4)" }}>
          <SectionHeader title="Estimate Margins" />
          <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
            Recent sent/approved estimates with internal cost tracking (all dates). Margin = (labor revenue − internal labor cost) / labor revenue.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", minWidth: 600 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Estimate</th>
                  <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Total</th>
                  <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Internal Cost</th>
                  <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Margin</th>
                  <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Scope</th>
                </tr>
              </thead>
              <tbody>
                {estimateMarginRows.map((row) => {
                  const laborRevenue = row.total_cents - (row.internal_material_cost_cents ?? 0) - Math.round((row.internal_material_cost_cents ?? 0) * 0.15);
                  const internalCost = row.internal_labor_cost_cents ?? 0;
                  const marginCents = laborRevenue - internalCost;
                  const marginPct = laborRevenue > 0 ? Math.round((marginCents / laborRevenue) * 100 * 10) / 10 : 0;
                  const marginColor = marginPct >= 30 ? "var(--status-success)" : marginPct >= 15 ? "var(--status-warning)" : "var(--status-error)";
                  return (
                    <tr key={row.estimate_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                        <Link
                          href={`/app/estimates/${row.estimate_id}` as Route}
                          style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                        >
                          {row.client_name ?? "Unknown"}
                        </Link>
                        {row.job_title && (
                          <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{row.job_title}</div>
                        )}
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(row.total_cents)}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(internalCost + (row.internal_material_cost_cents ?? 0))}</td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 700, color: marginColor }}>
                        {marginPct}%
                      </td>
                      <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", color: "var(--fg-muted)" }}>
                        {row.sq_ft !== null ? `${Number(row.sq_ft).toLocaleString()} sq ft` : "—"}
                        {row.prep_level !== null ? ` · L${row.prep_level}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageContainer>
  );
}
