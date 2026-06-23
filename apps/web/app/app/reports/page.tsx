import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { canViewReports } from "@/lib/auth/permissions";
import {
  EmptyState,
  FilterBar,
  MetricGrid,
  PageContainer,
  PageHeader,
} from "@/components/ui";
import type { FilterDef } from "@/components/ui";
import { formatCents } from "./format";
import { loadReportData, loadInvoiceAging } from "./queries";
import { FinancialSection } from "./sections/FinancialSection";
import { InvoiceAgingSection } from "./sections/InvoiceAgingSection";
import { TechnicianSection } from "./sections/TechnicianSection";
import { OperationsSection } from "./sections/OperationsSection";
import { PricingHealthSection } from "./sections/PricingHealthSection";
import { EstimateMarginsSection } from "./sections/EstimateMarginsSection";
import { TimeSection } from "./sections/TimeSection";

export const dynamic = "force-dynamic";

const REPORT_FILTERS: FilterDef[] = [
  { name: "month", type: "text", label: "Month", placeholder: "2026-03" },
];

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

  const data = await loadReportData(session.accountId, targetMonth);
  const invoiceAging = await loadInvoiceAging(session.accountId);

  const currentValues: Record<string, string> = {};
  if (month) currentValues.month = month;

  const [year, mon] = targetMonth.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mon) - 1, 1).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
  });

  return (
    <PageContainer>
      <PageHeader
        title="Profitability"
        subtitle={monthLabel}
        actions={
          <>
            <Link href={"/app/timeline" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>
              Activity Timeline →
            </Link>
            <Link href={"/app/reports/close" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>
              Month-End Close →
            </Link>
          </>
        }
      />

      {/* Month filter */}
      <div style={{ marginBottom: "var(--space-4)" }}>
        <FilterBar filters={REPORT_FILTERS} baseHref="/app/reports" currentValues={currentValues} />
      </div>

      {/* KPI summary */}
      <MetricGrid
        metrics={[
          { label: "Revenue (Paid)", value: formatCents(data.revenuePaidCents), variant: data.revenuePaidCents > 0 ? "success" : "default" },
          { label: "Total Expenses", value: formatCents(data.expensesTotalCents), variant: data.expensesTotalCents > 0 ? "alert" : "default" },
          { label: "Net (Paid − Expenses)", value: formatCents(data.netCents), variant: data.netCents < 0 ? "alert" : data.netCents > 0 ? "success" : "default" },
          { label: "Outstanding AR", value: formatCents(data.revenueOutstandingCents), variant: data.revenueOutstandingCents > 0 ? "alert" : "default" },
          { label: "Estimate Conversion", value: `${data.conversionRate}%`, variant: data.conversionRate >= 30 ? "success" : data.conversionRate > 0 ? "default" : "alert" },
          { label: "Active Jobs", value: String(data.totalJobs), variant: "default" },
        ]}
      />

      {!data.hasAnyData ? (
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
          <FinancialSection data={data} monthLabel={monthLabel} />
          <TechnicianSection rows={data.techPerformance} monthLabel={monthLabel} />
        </>
      )}

      {/* Always-on sections — render regardless of monthly financial activity */}
      <InvoiceAgingSection aging={invoiceAging} />
      <TimeSection rows={data.timeByCategory} monthLabel={monthLabel} />
      <OperationsSection scheduleUtil={data.scheduleUtil} monthLabel={monthLabel} />
      <PricingHealthSection
        pricingSummary={data.pricingSummary}
        lowValue={data.lowValue}
        overrideReasonRows={data.overrideReasonRows}
        belowMinimumEstimates={data.belowMinimumEstimates}
      />
      <EstimateMarginsSection rows={data.estimateMarginRows} />
    </PageContainer>
  );
}
