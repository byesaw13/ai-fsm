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
  StatusBadge,
} from "@/components/ui";
import type { MetricCardData, StatusVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CountRow    = { count: string };
type MoneyRow    = { count: string; total_cents: string };
type RevenueRow  = { total_cents: string };
type ExceptionRow = { kind: string; count: string };

type VisitRow = {
  id: string;
  scheduled_start: string;
  status: string;
  job_title: string;
  client_name: string;
};

type PlanSummaryRow = {
  count: string;
  arr_cents: string;
  essential_count: string;
  plus_count: string;
  premier_count: string;
};

type RenewalRow = {
  id: string;
  name: string;
  membership_tier: string;
  member_priority: string;
  annual_price_cents: string;
  billing_cadence: string;
  renewal_date: string;
  client_name: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number | string): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

function renewalBadge(renewalDate: string): { label: string; bg: string; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(renewalDate);
  const daysOut = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (daysOut < 0)  return { label: "Overdue",     bg: "#fee2e2", color: "#dc2626" };
  if (daysOut <= 30) return { label: `${daysOut}d`, bg: "#fef3c7", color: "#d97706" };
  return               { label: `${daysOut}d`,      bg: "#dbeafe", color: "#2563eb" };
}

const TIER_LABELS: Record<string, string> = { essential: "Essential", plus: "Plus", premier: "Premier" };
const PRIORITY_LABELS: Record<string, string> = { priority: "Priority", vip: "VIP" };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;

  const [
    revenueRows,
    planSummary,
    renewingSoon,
    overdueRenewals,
    capOverrunCount,
    snapshotPendingCount,
    todayVisits,
    overdueInvoices,
    expiringEstimates,
    estimatesAwaiting,
    jobsNoNextVisit,
    exceptionRows,
    renewalsList,
  ] = await Promise.all([

    // Revenue collected this month (paid / partial invoices)
    query<RevenueRow>(
      `SELECT COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1
         AND status IN ('partial','paid')
         AND created_at >= date_trunc('month', NOW())`,
      [accountId]
    ),

    // Active membership summary: count + ARR + tier breakdown
    query<PlanSummaryRow>(
      `SELECT
         COUNT(*)::text AS count,
         COALESCE(SUM(annual_price_cents), 0)::text AS arr_cents,
         COUNT(*) FILTER (WHERE membership_tier = 'essential')::text AS essential_count,
         COUNT(*) FILTER (WHERE membership_tier = 'plus')::text       AS plus_count,
         COUNT(*) FILTER (WHERE membership_tier = 'premier')::text    AS premier_count
       FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'`,
      [accountId]
    ),

    // Memberships renewing within 30 days
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'
         AND renewal_date IS NOT NULL
         AND renewal_date > CURRENT_DATE
         AND renewal_date <= CURRENT_DATE + INTERVAL '30 days'`,
      [accountId]
    ),

    // Memberships with overdue renewal date
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'
         AND renewal_date IS NOT NULL
         AND renewal_date < CURRENT_DATE`,
      [accountId]
    ),

    // Active membership visits at labor cap
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1
         AND generated_from_plan_id IS NOT NULL
         AND membership_cap_status IN ('cap_reached','approval_required')
         AND status NOT IN ('completed','cancelled')`,
      [accountId]
    ),

    // Membership visits pending snapshot delivery
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1
         AND generated_from_plan_id IS NOT NULL
         AND membership_visit_phase = 'reporting'
         AND membership_snapshot_sent_at IS NULL
         AND status != 'cancelled'`,
      [accountId]
    ),

    // Today's visits (schedule strip)
    query<VisitRow>(
      `SELECT v.id,
              v.scheduled_start::text AS scheduled_start,
              v.status,
              j.title AS job_title,
              c.name  AS client_name
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       JOIN clients c ON c.id = j.client_id
       WHERE v.account_id = $1
         AND v.scheduled_start::date = CURRENT_DATE
       ORDER BY v.scheduled_start ASC`,
      [accountId]
    ),

    // Overdue invoices: count + outstanding total
    query<MoneyRow>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status = 'overdue'`,
      [accountId]
    ),

    // Estimates expiring within 7 days (sent or draft)
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status IN ('draft','sent')
         AND expires_at IS NOT NULL
         AND expires_at < NOW() + INTERVAL '7 days'`,
      [accountId]
    ),

    // Sent estimates awaiting client response
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status = 'sent'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [accountId]
    ),

    // Active jobs with no future scheduled visit
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM jobs
       WHERE account_id = $1
         AND status IN ('scheduled','in_progress')
         AND NOT EXISTS (
           SELECT 1 FROM visits
           WHERE visits.job_id = jobs.id
             AND visits.status = 'scheduled'
             AND visits.scheduled_start > NOW()
         )`,
      [accountId]
    ),

    // Jobs + visits with active sub-status (exception lanes)
    query<ExceptionRow>(
      `SELECT 'job'   AS kind, COUNT(*)::text AS count FROM jobs   WHERE account_id = $1 AND sub_status IS NOT NULL
       UNION ALL
       SELECT 'visit' AS kind, COUNT(*)::text AS count FROM visits WHERE account_id = $1 AND sub_status IS NOT NULL`,
      [accountId]
    ),

    // Upcoming renewal list — overdue + within 60 days
    query<RenewalRow>(
      `SELECT mp.id, mp.name, mp.membership_tier, mp.member_priority,
              mp.annual_price_cents::text, mp.billing_cadence, mp.renewal_date::text,
              c.name AS client_name
       FROM maintenance_plans mp
       JOIN clients c ON mp.client_id = c.id
       WHERE mp.account_id = $1
         AND mp.status = 'active'
         AND mp.renewal_date IS NOT NULL
         AND mp.renewal_date <= CURRENT_DATE + INTERVAL '60 days'
       ORDER BY mp.renewal_date ASC
       LIMIT 20`,
      [accountId]
    ),
  ]);

  // -- Derived values --------------------------------------------------------

  const revenueThisMonth   = parseInt(revenueRows[0]?.total_cents ?? "0", 10);
  const summary            = planSummary[0] ?? { count: "0", arr_cents: "0", essential_count: "0", plus_count: "0", premier_count: "0" };
  const activeMembers      = parseInt(summary.count, 10);
  const arrCents           = parseInt(summary.arr_cents, 10);
  const renewingSoonCount  = parseN(renewingSoon[0]);
  const overdueRenewalCount = parseN(overdueRenewals[0]);
  const capCount           = parseN(capOverrunCount[0]);
  const snapshotCount      = parseN(snapshotPendingCount[0]);
  const overdueInvCount    = parseN(overdueInvoices[0]);
  const overdueInvTotal    = parseInt(overdueInvoices[0]?.total_cents ?? "0", 10);
  const expiringCount      = parseN(expiringEstimates[0]);
  const awaitingCount      = parseN(estimatesAwaiting[0]);
  const noNextVisitCount   = parseN(jobsNoNextVisit[0]);
  const exceptionJobCount  = parseN(exceptionRows.find((r) => r.kind === "job"));
  const exceptionVisitCount = parseN(exceptionRows.find((r) => r.kind === "visit"));

  const alertCount = overdueInvCount + expiringCount + (capCount + snapshotCount) + (exceptionJobCount + exceptionVisitCount);

  // -- Metrics ---------------------------------------------------------------

  const metrics: MetricCardData[] = [
    {
      label: "Revenue This Month",
      value: fmt(revenueThisMonth),
      sub: "Collected invoices",
      href: "/app/reports",
      variant: revenueThisMonth > 0 ? "success" : "default",
    },
    {
      label: "Active Members",
      value: activeMembers,
      sub: `${summary.essential_count} Essential · ${summary.plus_count} Plus · ${summary.premier_count} Premier`,
      href: "/app/maintenance-plans",
      variant: "default",
    },
    {
      label: "Annual Run Rate",
      value: fmt(arrCents),
      sub: "Active memberships",
      href: "/app/maintenance-plans",
      variant: "default",
    },
    {
      label: "Estimates Awaiting",
      value: awaitingCount,
      sub: "Sent, client not responded",
      href: "/app/estimates?status=sent",
      variant: awaitingCount > 0 ? "alert" : "default",
    },
    {
      label: "Renewing in 30 Days",
      value: renewingSoonCount,
      sub: overdueRenewalCount > 0 ? `+ ${overdueRenewalCount} overdue` : "Active memberships",
      href: "/app/maintenance-plans",
      variant: renewingSoonCount > 0 || overdueRenewalCount > 0 ? "alert" : "default",
    },
    {
      label: "Jobs Without Next Visit",
      value: noNextVisitCount,
      sub: "Active jobs, no visit scheduled",
      href: "/app/jobs",
      variant: noNextVisitCount > 0 ? "alert" : "default",
    },
  ];

  // -- Table styles (inline, reused) -----------------------------------------

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
        title="Home"
        subtitle="What needs your attention today"
      />

      {/* ── KPI metrics ───────────────────────────────────────────────────── */}
      <MetricGrid metrics={metrics} />

      {/* ── Today's Schedule ──────────────────────────────────────────────── */}
      <Card hover padding="lg" className="ops-wide-card" style={{ marginTop: "var(--space-6)" }}>
        <div className="ops-section-header">
          <h2 className="ops-section-title">Today&apos;s Schedule</h2>
          <span className="ops-section-count">{todayVisits.length}</span>
        </div>
        {todayVisits.length === 0 ? (
          <EmptyState title="No visits scheduled today" description="The schedule will appear here when visits are booked." />
        ) : (
          <div className="ops-visit-list">
            {todayVisits.map((v) => (
              <Link key={v.id} href={`/app/visits/${v.id}` as Route} className="ops-visit-row">
                <div className="ops-visit-time">
                  <span>{fmtTime(v.scheduled_start)}</span>
                </div>
                <div className="ops-visit-body">
                  <div className="ops-visit-client">{v.client_name}</div>
                  <div className="ops-visit-job">{v.job_title}</div>
                </div>
                <StatusBadge variant={v.status as StatusVariant}>{v.status.replace("_", " ")}</StatusBadge>
              </Link>
            ))}
          </div>
        )}
        <div style={{ marginTop: "var(--space-3)", textAlign: "right" }}>
          <Link href={"/app/schedule" as Route} style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
            Full schedule →
          </Link>
        </div>
      </Card>

      {/* ── Alerts & Actions ──────────────────────────────────────────────── */}
      {alertCount > 0 && (
        <Card hover padding="lg" className="ops-wide-card" style={{ marginTop: "var(--space-6)" }}>
          <div className="ops-section-header">
            <h2 className="ops-section-title">Alerts</h2>
            <span className="ops-section-count" style={{ background: "var(--status-error)", color: "#fff" }}>{alertCount}</span>
          </div>
          <div className="ops-alert-grid">
            {overdueInvCount > 0 && (
              <div className="ops-alert-item">
                <div className="ops-alert-label">Overdue invoices</div>
                <div className="ops-alert-value">{overdueInvCount}</div>
                <div className="ops-alert-sub">{fmt(overdueInvTotal)} outstanding</div>
                <Link href={"/app/invoices?status=overdue" as Route} className="ops-alert-link">View invoices →</Link>
              </div>
            )}
            {expiringCount > 0 && (
              <div className="ops-alert-item">
                <div className="ops-alert-label">Expiring estimates</div>
                <div className="ops-alert-value">{expiringCount}</div>
                <div className="ops-alert-sub">Expiring within 7 days</div>
                <Link href={"/app/estimates?status=sent" as Route} className="ops-alert-link">View estimates →</Link>
              </div>
            )}
            {capCount > 0 && (
              <div className="ops-alert-item">
                <div className="ops-alert-label">Labor cap overruns</div>
                <div className="ops-alert-value">{capCount}</div>
                <div className="ops-alert-sub">Active visits at or over cap</div>
                <Link href={"/app/visits" as Route} className="ops-alert-link">View visits →</Link>
              </div>
            )}
            {snapshotCount > 0 && (
              <div className="ops-alert-item">
                <div className="ops-alert-label">Snapshots pending</div>
                <div className="ops-alert-value">{snapshotCount}</div>
                <div className="ops-alert-sub">Membership visits awaiting delivery</div>
                <Link href={"/app/visits" as Route} className="ops-alert-link">View visits →</Link>
              </div>
            )}
            {(exceptionJobCount + exceptionVisitCount) > 0 && (
              <div className="ops-alert-item">
                <div className="ops-alert-label">Exception lanes</div>
                <div className="ops-alert-value">{exceptionJobCount + exceptionVisitCount}</div>
                <div className="ops-alert-sub">{exceptionJobCount} jobs · {exceptionVisitCount} visits</div>
                <div className="ops-alert-links">
                  <Link href={"/app/jobs" as Route} className="ops-alert-link">Jobs →</Link>
                  <Link href={"/app/visits" as Route} className="ops-alert-link">Visits →</Link>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Upcoming Renewals ─────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        <SectionHeader title="Upcoming Renewals" count={renewalsList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active memberships renewing within 60 days, including overdue.
        </p>
        {renewalsList.length === 0 ? (
          <EmptyState title="No renewals due in the next 60 days." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Renewal</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Annual</th>
                </tr>
              </thead>
              <tbody>
                {renewalsList.map((row) => {
                  const badge = renewalBadge(row.renewal_date);
                  const priorityLabel = PRIORITY_LABELS[row.member_priority];
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>
                        <Link href={`/app/maintenance-plans/${row.id}` as Route} style={{ color: "var(--fg-link)", textDecoration: "none" }}>
                          {row.name}
                        </Link>
                        {priorityLabel && (
                          <span style={{
                            marginLeft: "var(--space-2)", fontSize: "var(--text-xs)", padding: "1px 6px", borderRadius: 4,
                            background: row.member_priority === "vip" ? "#fef3c7" : "#dbeafe",
                            color: row.member_priority === "vip" ? "#d97706" : "#2563eb",
                          }}>
                            {priorityLabel}
                          </span>
                        )}
                      </td>
                      <td style={td}>{TIER_LABELS[row.membership_tier] ?? row.membership_tier}</td>
                      <td style={td}>{fmtDate(row.renewal_date)}</td>
                      <td style={td}>
                        <span style={{ fontSize: "var(--text-xs)", padding: "2px 8px", borderRadius: 4, background: badge.bg, color: badge.color, fontWeight: 500 }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(row.annual_price_cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {renewalsList.length > 0 && (
          <div style={{ marginTop: "var(--space-3)", textAlign: "right" }}>
            <Link href={"/app/maintenance-plans" as Route} style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}>
              All memberships →
            </Link>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
