import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";
import { formatCents, categoryLabel, statusLabel } from "../format";
import type { ReportData } from "../queries";

const TH_LEFT = { textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" } as const;
const TH_RIGHT = { textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" } as const;

/**
 * Profitability / financial cards for the Reports page: estimate conversion
 * funnel, revenue by job type, revenue, expenses, mileage, and job
 * profitability. Rendered only when the month has any financial activity.
 */
export function FinancialSection({ data, monthLabel }: { data: ReportData; monthLabel: string }) {
  const {
    invoiceStatuses, expensesByCategory, jobProfitRows, revenueByJobType, estimateConversion,
    revenueTotalCents, revenuePaidCents, expensesTotalCents, mileageTripCount, mileageTotalMiles,
    totalEstimates, conversionRate,
  } = data;

  return (
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
                <th style={TH_LEFT}>Job Type</th>
                <th style={TH_RIGHT}>Jobs</th>
                <th style={TH_RIGHT}>Revenue</th>
                <th style={TH_RIGHT}>Collected</th>
                <th style={TH_RIGHT}>Avg/Job</th>
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
                <th style={TH_LEFT}>Status</th>
                <th style={TH_RIGHT}>Count</th>
                <th style={TH_RIGHT}>Invoiced</th>
                <th style={TH_RIGHT}>Collected</th>
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
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(revenueTotalCents)}</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(revenuePaidCents)}</td>
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
                <th style={TH_LEFT}>Category</th>
                <th style={TH_RIGHT}>Count</th>
                <th style={TH_RIGHT}>Total</th>
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
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(expensesTotalCents)}</td>
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
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{mileageTotalMiles.toFixed(1)}</div>
          </div>
          <div>
            <div style={{ color: "var(--fg-muted)" }}>Trips</div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{mileageTripCount}</div>
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
                  <th style={TH_LEFT}>Job</th>
                  <th style={TH_RIGHT}>Revenue</th>
                  <th style={TH_RIGHT}>Expenses</th>
                  <th style={TH_RIGHT}>Miles</th>
                  <th style={TH_RIGHT}>Net</th>
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
  );
}
