import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Card,
  EmptyState,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import type { MetricCardData } from "@/components/ui";
import { MINIMUM_SERVICE_FEE_CENTS } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MembershipRevenueRow = {
  membership_revenue_cents: string;
  total_revenue_cents: string;
};

type ScheduleUtilRow = {
  scheduled_count: string;
  completed_count: string;
  cancelled_count: string;
  avg_per_week: string;
};

type LowValueRow = {
  count: string;
  total_jobs: string;
};

type JobCategoryRow = {
  job_category: string | null;
  count: string;
  total_revenue_cents: string;
};

type IntakeDecisionRow = {
  intake_decision: string | null;
  count: string;
};

type RealtorBaselineRow = {
  total_baselines: string;
  converted: string;
  pending_conversion: string;
};

type VendorCoordRow = {
  mode: string;
  count: string;
  total_fee_cents: string;
};

type VolatilityRow = {
  reschedule_count: string;
  cancellation_count: string;
  total_visits: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number | string): string {
  const n = Number(cents);
  if (isNaN(n)) return "—";
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

const JOB_CATEGORY_LABELS: Record<string, string> = {
  membership:            "Membership",
  realtor_baseline:      "Realtor Baseline",
  high_margin_project:   "High Margin Project",
  reactive_low_quality:  "Reactive / Low Quality",
};

const INTAKE_LABELS: Record<string, string> = {
  accept:   "Accepted",
  decline:  "Declined",
  defer:    "Deferred",
  reframe:  "Reframed",
};

const VENDOR_COORD_LABELS: Record<string, string> = {
  referral:  "Referral",
  concierge: "Concierge",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OperationsDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const minCents = MINIMUM_SERVICE_FEE_CENTS;

  const [
    membershipRevenueRows,
    scheduleUtilRows,
    lowValueRows,
    jobCategoryRows,
    intakeDecisionRows,
    realtorBaselineRows,
    vendorCoordRows,
    volatilityRows,
  ] = await Promise.all([

    // Membership revenue % of total (paid/partial invoices this calendar year)
    query<MembershipRevenueRow>(
      `SELECT
         COALESCE(SUM(i.total_cents) FILTER (
           WHERE j.job_category = 'membership'
         ), 0)::text AS membership_revenue_cents,
         COALESCE(SUM(i.total_cents), 0)::text AS total_revenue_cents
       FROM invoices i
       JOIN jobs j ON j.id = i.job_id
       WHERE i.account_id = $1
         AND i.status IN ('paid','partial')
         AND i.created_at >= date_trunc('year', NOW())`,
      [accountId]
    ),

    // Schedule utilization: visits this month
    query<ScheduleUtilRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'scheduled')::text AS scheduled_count,
         COUNT(*) FILTER (WHERE status = 'completed')::text AS completed_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancelled_count,
         ROUND(COUNT(*)::numeric / GREATEST(EXTRACT(WEEK FROM NOW()) - EXTRACT(WEEK FROM date_trunc('month', NOW())) + 1, 1), 1)::text AS avg_per_week
       FROM visits
       WHERE account_id = $1
         AND scheduled_start >= date_trunc('month', NOW())`,
      [accountId]
    ),

    // Low-value job ratio: jobs below minimum fee with no override
    query<LowValueRow>(
      `SELECT
         COUNT(*) FILTER (
           WHERE e.total_cents < $2
             AND e.minimum_service_override_reason IS NULL
         )::text AS count,
         COUNT(DISTINCT j.id)::text AS total_jobs
       FROM jobs j
       LEFT JOIN estimates e ON e.job_id = j.id AND e.status IN ('approved','sent')
       WHERE j.account_id = $1
         AND j.status IN ('scheduled','in_progress','completed')
         AND e.id IS NOT NULL`,
      [accountId, minCents]
    ),

    // Job category breakdown (YTD)
    query<JobCategoryRow>(
      `SELECT
         j.job_category,
         COUNT(*)::text AS count,
         COALESCE(SUM(i.total_cents), 0)::text AS total_revenue_cents
       FROM jobs j
       LEFT JOIN invoices i ON i.job_id = j.id AND i.status IN ('paid','partial')
       WHERE j.account_id = $1
         AND j.created_at >= date_trunc('year', NOW())
       GROUP BY j.job_category
       ORDER BY count DESC`,
      [accountId]
    ),

    // Intake decision breakdown (YTD)
    query<IntakeDecisionRow>(
      `SELECT
         intake_decision,
         COUNT(*)::text AS count
       FROM jobs
       WHERE account_id = $1
         AND created_at >= date_trunc('year', NOW())
         AND intake_decision IS NOT NULL
       GROUP BY intake_decision
       ORDER BY count DESC`,
      [accountId]
    ),

    // Realtor baseline activity (all time)
    query<RealtorBaselineRow>(
      `SELECT
         COUNT(*)::text AS total_baselines,
         COUNT(*) FILTER (WHERE converted.id IS NOT NULL)::text AS converted,
         COUNT(*) FILTER (WHERE v.status = 'completed' AND converted.id IS NULL)::text AS pending_conversion
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       LEFT JOIN LATERAL (
         SELECT id FROM maintenance_plans
         WHERE client_id = j.client_id
           AND account_id = $1
           AND status = 'active'
           AND created_at > v.scheduled_start
         LIMIT 1
       ) converted ON true
       WHERE v.account_id = $1
         AND v.visit_type = 'realtor_baseline'`,
      [accountId]
    ),

    // Vendor coordination modes (active jobs)
    query<VendorCoordRow>(
      `SELECT
         vendor_coordination AS mode,
         COUNT(*)::text AS count,
         COALESCE(SUM(concierge_fee_cents), 0)::text AS total_fee_cents
       FROM jobs
       WHERE account_id = $1
         AND vendor_coordination IS NOT NULL
         AND status NOT IN ('draft')
       GROUP BY vendor_coordination
       ORDER BY count DESC`,
      [accountId]
    ),

    // Schedule volatility: cancelled + rescheduled visits this month
    query<VolatilityRow>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'cancelled')::text AS cancellation_count,
         0::text AS reschedule_count,
         COUNT(*)::text AS total_visits
       FROM visits
       WHERE account_id = $1
         AND scheduled_start >= date_trunc('month', NOW())`,
      [accountId]
    ),
  ]);

  // -- Derived values --------------------------------------------------------

  const mrRow = membershipRevenueRows[0] ?? { membership_revenue_cents: "0", total_revenue_cents: "0" };
  const membershipRevCents = parseInt(mrRow.membership_revenue_cents, 10);
  const totalRevCents = parseInt(mrRow.total_revenue_cents, 10);
  const membershipRevPct = totalRevCents > 0
    ? Math.round((membershipRevCents / totalRevCents) * 100)
    : 0;

  const suRow = scheduleUtilRows[0] ?? { scheduled_count: "0", completed_count: "0", cancelled_count: "0", avg_per_week: "0" };

  const lvRow = lowValueRows[0] ?? { count: "0", total_jobs: "0" };
  const lowValueCount = parseInt(lvRow.count, 10);
  const totalJobCount = parseInt(lvRow.total_jobs, 10);
  const lowValueRate = totalJobCount > 0
    ? Math.round((lowValueCount / totalJobCount) * 100)
    : 0;

  const volRow = volatilityRows[0] ?? { reschedule_count: "0", cancellation_count: "0", total_visits: "0" };
  const cancellationCount = parseInt(volRow.cancellation_count, 10);
  const totalVisitsThisMonth = parseInt(volRow.total_visits, 10);
  const volatilityRate = totalVisitsThisMonth > 0
    ? Math.round((cancellationCount / totalVisitsThisMonth) * 100)
    : 0;

  const rbRow = realtorBaselineRows[0] ?? { total_baselines: "0", converted: "0", pending_conversion: "0" };

  // -- Metrics ---------------------------------------------------------------

  const metrics: MetricCardData[] = [
    {
      label: "Membership Revenue %",
      value: `${membershipRevPct}%`,
      sub: `${fmt(membershipRevCents)} of ${fmt(totalRevCents)} YTD`,
      href: "#revenue-mix",
      variant: membershipRevPct < 30 ? "default" : "success",
    },
    {
      label: "Visits This Month",
      value: parseInt(suRow.completed_count, 10) + parseInt(suRow.scheduled_count, 10),
      sub: `${suRow.completed_count} completed · ${suRow.scheduled_count} scheduled`,
      href: "/app/schedule",
      variant: "default",
    },
    {
      label: "Schedule Volatility",
      value: `${volatilityRate}%`,
      sub: `${cancellationCount} cancellations this month`,
      href: "#volatility",
      variant: volatilityRate > 20 ? "alert" : "default",
    },
    {
      label: "Low-Value Job Ratio",
      value: `${lowValueRate}%`,
      sub: `${lowValueCount} jobs below minimum fee`,
      href: "#job-mix",
      variant: lowValueRate > 25 ? "alert" : "default",
    },
    {
      label: "Realtor Baselines",
      value: rbRow.total_baselines,
      sub: `${rbRow.converted} converted · ${rbRow.pending_conversion} unconverted`,
      href: "/app/membership-dashboard#baselines",
      variant: "default",
    },
  ];

  // -- Table styles ----------------------------------------------------------

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "var(--space-2) var(--space-3)",
    color: "var(--fg-muted)",
    fontWeight: 500,
    fontSize: "var(--text-sm)",
    borderBottom: "1px solid var(--border)",
  };
  const td: React.CSSProperties = {
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-sm)",
    verticalAlign: "middle",
  };

  // --------------------------------------------------------------------------

  return (
    <PageContainer>
      <PageHeader
        title="Operations Dashboard"
        subtitle="Revenue mix, schedule utilization, job quality, and routing activity"
      />

      <MetricGrid metrics={metrics} />

      {/* ── Revenue Mix ────────────────────────────────────────────────────── */}
      <Card id="revenue-mix" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Job Category Revenue Mix (YTD)" />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Revenue from paid/partial invoices this year, grouped by job acceptance category.
        </p>
        {jobCategoryRows.length === 0 ? (
          <EmptyState title="No job revenue data" description="Revenue by category will appear here once jobs are invoiced." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Category</th>
                  <th style={{ ...th, textAlign: "right" }}>Jobs</th>
                  <th style={{ ...th, textAlign: "right" }}>Revenue</th>
                  <th style={{ ...th, textAlign: "right" }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {jobCategoryRows.map((row) => {
                  const revCents = parseInt(row.total_revenue_cents, 10);
                  const pct = totalRevCents > 0 ? Math.round((revCents / totalRevCents) * 100) : 0;
                  const label = row.job_category
                    ? (JOB_CATEGORY_LABELS[row.job_category] ?? row.job_category)
                    : "Uncategorized";
                  return (
                    <tr key={row.job_category ?? "null"} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{label}</td>
                      <td style={{ ...td, textAlign: "right" }}>{row.count}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(revCents)}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Job Quality / Intake ───────────────────────────────────────────── */}
      <Card id="job-mix" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Intake Decision Breakdown (YTD)" />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          How jobs have been scored during intake this year.
        </p>
        {intakeDecisionRows.length === 0 ? (
          <EmptyState title="No intake decisions recorded" description="Intake decisions will appear here as jobs are triaged." />
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {intakeDecisionRows.map((row) => {
              const label = row.intake_decision
                ? (INTAKE_LABELS[row.intake_decision] ?? row.intake_decision)
                : "Not set";
              const isGood = row.intake_decision === "accept";
              const isBad = row.intake_decision === "decline";
              return (
                <div key={row.intake_decision ?? "null"} style={{
                  flex: "1 1 120px",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  background: isGood ? "#dcfce720" : isBad ? "#fee2e220" : "var(--color-surface-raised, #f8fafc)",
                  border: `1px solid ${isGood ? "#86efac" : isBad ? "#fca5a5" : "var(--border)"}`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>{label}</div>
                  <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{row.count}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Vendor Coordination ────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Vendor Coordination Activity" count={vendorCoordRows.reduce((s, r) => s + parseInt(r.count, 10), 0)} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Jobs using vendor coordination modes. Concierge fees represent additional revenue.
        </p>
        {vendorCoordRows.length === 0 ? (
          <EmptyState title="No vendor coordination" description="Jobs with referral or concierge coordination will appear here." />
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {vendorCoordRows.map((row) => {
              const feeCents = parseInt(row.total_fee_cents, 10);
              return (
                <div key={row.mode} style={{
                  flex: "1 1 160px",
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-surface-raised, #f8fafc)",
                  border: "1px solid var(--border)",
                }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
                    {VENDOR_COORD_LABELS[row.mode] ?? row.mode}
                  </div>
                  <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{row.count} jobs</div>
                  {feeCents > 0 && (
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 4 }}>
                      {fmt(feeCents)} in fees
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: "var(--space-3)", textAlign: "right" }}>
          <Link
            href={"/app/jobs" as Route}
            style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
          >
            All jobs →
          </Link>
        </div>
      </Card>

      {/* ── Schedule Volatility ────────────────────────────────────────────── */}
      <Card id="volatility" style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        <SectionHeader title="Schedule Health (This Month)" />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Visit completion and cancellation rates for the current month.
        </p>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          {[
            { label: "Completed", value: suRow.completed_count, good: true },
            { label: "Scheduled", value: suRow.scheduled_count, good: null },
            { label: "Cancelled", value: suRow.cancelled_count, good: false },
            { label: "Cancellation Rate", value: `${volatilityRate}%`, good: volatilityRate <= 10 ? true : false },
          ].map(({ label, value, good }) => (
            <div key={label} style={{
              flex: "1 1 120px",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              background: good === true ? "#dcfce720" : good === false ? "#fee2e220" : "var(--color-surface-raised, #f8fafc)",
              border: `1px solid ${good === true ? "#86efac" : good === false ? "#fca5a5" : "var(--border)"}`,
              textAlign: "center",
            }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>{label}</div>
              <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>
    </PageContainer>
  );
}
