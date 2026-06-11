import { query } from "@/lib/db";
import { MINIMUM_SERVICE_FEE_CENTS } from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type InvoiceStatusRow = {
  status: string;
  count: number;
  total_cents: string;
  paid_cents: string;
};

export type ExpenseCategoryRow = {
  category: string;
  count: number;
  total_cents: string;
};

export type JobProfitRow = {
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

export type EstimateMarginRow = {
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

export type RevenueByJobTypeRow = {
  job_type: string;
  job_count: number;
  revenue_cents: string;
  paid_cents: string;
  avg_job_cents: string;
};

export type TechPerformanceRow = {
  user_id: string;
  user_name: string;
  visits_completed: number;
  total_visits: number;
  completion_rate: string;
  avg_visits_per_tech: string;
};

export type EstimateConversionRow = {
  status: string;
  count: number;
  pct_of_total: string;
};

// Salvaged from the retired Operations Dashboard
export type ScheduleUtilRow = {
  scheduled_count: number;
  completed_count: number;
  cancelled_count: number;
  avg_per_week: string;
};

export type LowValueRow = {
  below_minimum: number;
  total_estimated_jobs: number;
};

// Salvaged from the retired Pricing Dashboard
export type PricingSummaryRow = {
  total: number;
  below_minimum: number;
  with_override: number;
  price_book_line_items: number;
  total_line_items: number;
};

export type OverrideReasonRow = {
  reason: string;
  count: number;
};

export type BelowMinimumEstimateRow = {
  id: string;
  total_cents: number;
  minimum_service_override_reason: string | null;
  client_name: string | null;
  job_title: string | null;
};

// Activity ledger — where the owner's time went (month-scoped)
export type TimeByCategoryRow = {
  category: string;
  minutes: number;
};

// ---------------------------------------------------------------------------
// Aggregate shape returned to the page
// ---------------------------------------------------------------------------

export interface ReportData {
  invoiceStatuses: InvoiceStatusRow[];
  expensesByCategory: ExpenseCategoryRow[];
  jobProfitRows: JobProfitRow[];
  estimateMarginRows: EstimateMarginRow[];
  revenueByJobType: RevenueByJobTypeRow[];
  techPerformance: TechPerformanceRow[];
  estimateConversion: EstimateConversionRow[];
  scheduleUtil: ScheduleUtilRow;
  lowValue: LowValueRow;
  pricingSummary: PricingSummaryRow;
  overrideReasonRows: OverrideReasonRow[];
  belowMinimumEstimates: BelowMinimumEstimateRow[];
  timeByCategory: TimeByCategoryRow[];

  // Derived aggregates
  revenueTotalCents: number;
  revenuePaidCents: number;
  revenueOutstandingCents: number;
  expensesTotalCents: number;
  mileageTripCount: number;
  mileageTotalMiles: number;
  netCents: number;
  hasAnyData: boolean;
  totalEstimates: number;
  conversionRate: number;
  totalJobs: number;
}

// ---------------------------------------------------------------------------
// Data loader — runs every Reports query for the target month.
// ---------------------------------------------------------------------------

export async function loadReportData(accountId: string, targetMonth: string): Promise<ReportData> {
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
    [accountId, targetMonth]
  );

  let revenueTotalCents = 0;
  let revenuePaidCents = 0;
  let revenueOutstandingCents = 0;
  for (const row of invoiceStatuses) {
    const total = Number(row.total_cents);
    const paid = Number(row.paid_cents);
    revenueTotalCents += total;
    revenuePaidCents += paid;
    if (!["paid", "void"].includes(row.status)) {
      revenueOutstandingCents += total - paid;
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
    [accountId, targetMonth]
  );
  const expensesTotalCents = expensesByCategory.reduce((sum, r) => sum + Number(r.total_cents), 0);

  // === Mileage: for the month ===
  const mileageRows = await query<{ trip_count: number; total_miles: string }>(
    `SELECT COUNT(*)::int as trip_count,
            COALESCE(SUM(miles), 0)::numeric as total_miles
     FROM vehicle_sessions
     WHERE account_id = $1
       AND to_char(session_date, 'YYYY-MM') = $2`,
    [accountId, targetMonth]
  );
  const mileageTripCount = Number(mileageRows[0]?.trip_count ?? 0);
  const mileageTotalMiles = Number(mileageRows[0]?.total_miles ?? 0);

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
    [accountId, targetMonth]
  );

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
    [accountId]
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
    [accountId, targetMonth]
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
    [accountId, targetMonth]
  );

  // === Estimate conversion funnel (month-scoped) ===
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
    [accountId, targetMonth]
  );

  // === Schedule utilization (salvaged from Operations Dashboard, month-scoped) ===
  const scheduleUtilRows = await query<ScheduleUtilRow>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled_count,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
       COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
       ROUND(COUNT(*)::numeric / 4.0, 1)::text AS avg_per_week
     FROM visits
     WHERE account_id = $1
       AND to_char(scheduled_start, 'YYYY-MM') = $2`,
    [accountId, targetMonth]
  );
  const scheduleUtil = scheduleUtilRows[0] ?? {
    scheduled_count: 0, completed_count: 0, cancelled_count: 0, avg_per_week: "0",
  };

  // === Low-value job ratio (salvaged from Operations Dashboard, current snapshot) ===
  const lowValueRows = await query<LowValueRow>(
    `SELECT
       COUNT(*) FILTER (
         WHERE e.total_cents < $2
           AND e.minimum_service_override_reason IS NULL
       )::int AS below_minimum,
       COUNT(DISTINCT j.id)::int AS total_estimated_jobs
     FROM jobs j
     JOIN estimates e ON e.job_id = j.id AND e.status IN ('approved','sent')
     WHERE j.account_id = $1
       AND j.status IN ('scheduled','in_progress','completed')`,
    [accountId, MINIMUM_SERVICE_FEE_CENTS]
  );
  const lowValue = lowValueRows[0] ?? { below_minimum: 0, total_estimated_jobs: 0 };

  // === Pricing health (salvaged from Pricing Dashboard) ===
  const pricingSummaryRows = await query<PricingSummaryRow>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE total_cents < $2)::int AS below_minimum,
       COUNT(*) FILTER (WHERE total_cents < $2 AND minimum_service_override_reason IS NOT NULL)::int AS with_override,
       (SELECT COUNT(*)::int FROM estimate_line_items eli
          JOIN estimates e2 ON e2.id = eli.estimate_id
          WHERE e2.account_id = $1 AND eli.price_book_id IS NOT NULL) AS price_book_line_items,
       (SELECT COUNT(*)::int FROM estimate_line_items eli
          JOIN estimates e2 ON e2.id = eli.estimate_id
          WHERE e2.account_id = $1) AS total_line_items
     FROM estimates
     WHERE account_id = $1`,
    [accountId, MINIMUM_SERVICE_FEE_CENTS]
  );
  const pricingSummary = pricingSummaryRows[0] ?? {
    total: 0, below_minimum: 0, with_override: 0, price_book_line_items: 0, total_line_items: 0,
  };

  const overrideReasonRows = await query<OverrideReasonRow>(
    `SELECT minimum_service_override_reason AS reason, COUNT(*)::int AS count
     FROM estimates
     WHERE account_id = $1
       AND minimum_service_override_reason IS NOT NULL
     GROUP BY minimum_service_override_reason
     ORDER BY count DESC`,
    [accountId]
  );

  const belowMinimumEstimates = await query<BelowMinimumEstimateRow>(
    `SELECT e.id, e.total_cents, e.minimum_service_override_reason,
            c.name AS client_name, j.title AS job_title
     FROM estimates e
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN jobs j ON j.id = e.job_id
     WHERE e.account_id = $1
       AND e.total_cents < $2
     ORDER BY e.created_at DESC
     LIMIT 25`,
    [accountId, MINIMUM_SERVICE_FEE_CENTS]
  );

  // === Where the owner's time went (activity ledger, month-scoped) ===
  const timeByCategory = await query<TimeByCategoryRow>(
    `SELECT category,
            ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at)) / 60))::int AS minutes
     FROM activity_entries
     WHERE account_id = $1
       AND voided_at IS NULL
       AND to_char(session_date, 'YYYY-MM') = $2
     GROUP BY category
     ORDER BY minutes DESC`,
    [accountId, targetMonth]
  );

  // === Derived aggregates ===
  const netCents = revenuePaidCents - expensesTotalCents;
  const hasAnyData = revenueTotalCents > 0 || expensesTotalCents > 0 || mileageTripCount > 0;
  const totalEstimates = estimateConversion.reduce((sum, r) => sum + r.count, 0);
  const approvedEstimates = estimateConversion.find((r) => r.status === "approved")?.count ?? 0;
  const conversionRate = totalEstimates > 0 ? Math.round((approvedEstimates / totalEstimates) * 100) : 0;

  return {
    invoiceStatuses,
    expensesByCategory,
    jobProfitRows,
    estimateMarginRows,
    revenueByJobType,
    techPerformance,
    estimateConversion,
    scheduleUtil,
    lowValue,
    pricingSummary,
    overrideReasonRows,
    belowMinimumEstimates,
    timeByCategory,
    revenueTotalCents,
    revenuePaidCents,
    revenueOutstandingCents,
    expensesTotalCents,
    mileageTripCount,
    mileageTotalMiles,
    netCents,
    hasAnyData,
    totalEstimates,
    conversionRate,
    totalJobs: jobProfitRows.length,
  };
}
