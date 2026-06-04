import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import {
  Card,
  EmptyState,
  MetricGrid,
  StatusBadge,
} from "@/components/ui";
import type { MetricCardData, StatusVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CountRow     = { count: string };
type MoneyRow     = { count: string; total_cents: string };
type RevenueRow   = { total_cents: string };
type ExceptionRow = { kind: string; count: string };
type UserRow      = { full_name: string };

type VisitRow = {
  id: string;
  scheduled_start: string;
  status: string;
  job_title: string;
  client_name: string;
  property_address: string | null;
};

type PendingRequestRow = {
  id: string;
  name: string;
  service_category: string;
  service_description: string;
  preferred_date: string;
  preferred_time_slot: string | null;
  created_at: string;
  city: string | null;
};

type PlanSummaryRow = {
  count: string;
  arr_cents: string;
  essential_count: string;
  plus_count: string;
  premier_count: string;
};

type ActionQueueItem = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number | string): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const isOwner   = session.role === "owner";

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [
    me,
    revenueRows,
    openARRow,
    activeJobsRow,
    pendingRequestsRow,
    pendingRequestRows,
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
    lastMonthRevenueRow,
  ] = await Promise.all([
    // Current user name
    queryForSession<UserRow>(session,
      `SELECT full_name FROM users WHERE id = $1`,
      [session.userId]),

    // Revenue collected this month
    queryForSession<RevenueRow>(session,
      `SELECT COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status IN ('partial','paid')
         AND created_at >= date_trunc('month', NOW())`,
      [accountId]),

    // Total open AR (sent + partial + overdue invoices)
    queryForSession<RevenueRow>(session,
      `SELECT COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status IN ('sent','partial','overdue')`,
      [accountId]),

    // Active jobs (scheduled or in-progress)
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count FROM jobs
       WHERE account_id = $1 AND status IN ('scheduled','in_progress')`,
      [accountId]),

    // Pending booking requests
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count FROM booking_requests
       WHERE account_id = $1 AND status = 'pending'`,
      [accountId]),

    // Oldest pending request for the home command card
    queryForSession<PendingRequestRow>(session,
      `SELECT id, name, service_category, service_description,
              preferred_date::text AS preferred_date,
              preferred_time_slot, created_at::text AS created_at,
              city
       FROM booking_requests
       WHERE account_id = $1 AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 1`,
      [accountId]),

    // Active membership summary: count + ARR + tier breakdown
    queryForSession<PlanSummaryRow>(session,
      `SELECT
         COUNT(*)::text AS count,
         COALESCE(SUM(annual_price_cents), 0)::text AS arr_cents,
         COUNT(*) FILTER (WHERE membership_tier = 'essential')::text AS essential_count,
         COUNT(*) FILTER (WHERE membership_tier = 'plus')::text       AS plus_count,
         COUNT(*) FILTER (WHERE membership_tier = 'premier')::text    AS premier_count
       FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'`,
      [accountId]),

    // Memberships renewing within 30 days
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'
         AND renewal_date IS NOT NULL
         AND renewal_date > CURRENT_DATE
         AND renewal_date <= CURRENT_DATE + INTERVAL '30 days'`,
      [accountId]),

    // Memberships with overdue renewal date
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'
         AND renewal_date IS NOT NULL
         AND renewal_date < CURRENT_DATE`,
      [accountId]),

    // Active membership visits at or over labor cap
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1
         AND generated_from_plan_id IS NOT NULL
         AND membership_cap_status IN ('cap_reached','approval_required')
         AND status NOT IN ('completed','cancelled')`,
      [accountId]),

    // Membership visits pending snapshot delivery
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1
         AND generated_from_plan_id IS NOT NULL
         AND membership_visit_phase = 'reporting'
         AND membership_snapshot_sent_at IS NULL
         AND status != 'cancelled'`,
      [accountId]),

    // Today's visits (with property address for context)
    queryForSession<VisitRow>(session,
      `SELECT v.id,
              v.scheduled_start::text AS scheduled_start,
              v.status,
              j.title     AS job_title,
              c.name      AS client_name,
              p.address   AS property_address
       FROM visits v
       JOIN jobs j     ON j.id = v.job_id
       JOIN clients c  ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       WHERE v.account_id = $1
         AND v.scheduled_start::date = CURRENT_DATE
       ORDER BY v.scheduled_start ASC`,
      [accountId]),

    // Overdue invoices: count + outstanding total
    queryForSession<MoneyRow>(session,
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status = 'overdue'`,
      [accountId]),

    // Estimates expiring within 7 days
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status IN ('draft','sent')
         AND expires_at IS NOT NULL
         AND expires_at < NOW() + INTERVAL '7 days'`,
      [accountId]),

    // Sent estimates awaiting client response
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status = 'sent'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [accountId]),

    // Active jobs with no future scheduled visit
    queryForSession<CountRow>(session,
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
      [accountId]),

    // Jobs + visits with active sub-status (exception lanes)
    queryForSession<ExceptionRow>(session,
      `SELECT 'job'   AS kind, COUNT(*)::text AS count FROM jobs   WHERE account_id = $1 AND sub_status IS NOT NULL
       UNION ALL
       SELECT 'visit' AS kind, COUNT(*)::text AS count FROM visits WHERE account_id = $1 AND sub_status IS NOT NULL`,
      [accountId]),

    // Owner only: revenue collected last calendar month (for trend)
    isOwner
      ? queryForSession<RevenueRow>(session,
          `SELECT COALESCE(SUM(total_cents), 0)::text AS total_cents
           FROM invoices
           WHERE account_id = $1 AND status IN ('partial','paid')
             AND created_at >= date_trunc('month', NOW() - INTERVAL '1 month')
             AND created_at <  date_trunc('month', NOW())`,
          [accountId])
      : Promise.resolve([{ total_cents: "0" }] as RevenueRow[]),
  ]);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const userName             = me[0]?.full_name ?? "";
  const firstName            = userName.split(" ")[0] || "";
  const revenueThisMonth     = parseInt(revenueRows[0]?.total_cents ?? "0", 10);
  const openAR               = parseInt(openARRow[0]?.total_cents ?? "0", 10);
  const activeJobsCount      = parseN(activeJobsRow[0]);
  const pendingRequestsCount = parseN(pendingRequestsRow[0]);
  const pendingRequest = pendingRequestRows[0] ?? null;
  const summary              = planSummary[0] ?? { count: "0", arr_cents: "0", essential_count: "0", plus_count: "0", premier_count: "0" };
  const activeMembers        = parseInt(summary.count, 10);
  const arrCents             = parseInt(summary.arr_cents, 10);
  const renewingSoonCount    = parseN(renewingSoon[0]);
  const overdueRenewalCount  = parseN(overdueRenewals[0]);
  const capCount             = parseN(capOverrunCount[0]);
  const snapshotCount        = parseN(snapshotPendingCount[0]);
  const overdueInvCount      = parseN(overdueInvoices[0]);
  const overdueInvTotal      = parseInt(overdueInvoices[0]?.total_cents ?? "0", 10);
  const expiringCount        = parseN(expiringEstimates[0]);
  const awaitingCount        = parseN(estimatesAwaiting[0]);
  const noNextVisitCount     = parseN(jobsNoNextVisit[0]);
  const exceptionJobCount    = parseN(exceptionRows.find((r) => r.kind === "job"));
  const exceptionVisitCount  = parseN(exceptionRows.find((r) => r.kind === "visit"));
  const lastMonthRev         = parseInt(lastMonthRevenueRow[0]?.total_cents ?? "0", 10);

  const revenueChangePct = lastMonthRev > 0
    ? Math.round(((revenueThisMonth - lastMonthRev) / lastMonthRev) * 100)
    : revenueThisMonth > 0 ? 100 : 0;

  // ---------------------------------------------------------------------------
  // Action queue — only shows items with count > 0
  // ---------------------------------------------------------------------------

  const actionQueue = ([
    {
      label: "Review requests",
      count: pendingRequestsCount,
      href: "/app/requests" as Route,
      detail: "Needs routing or follow-up",
      tone: pendingRequestsCount > 0 ? "warning" : "default",
    },
    {
      label: "Collect overdue invoices",
      count: overdueInvCount,
      href: "/app/invoices?status=overdue" as Route,
      detail: `${fmt(overdueInvTotal)} outstanding`,
      tone: "danger",
    },
    {
      label: "Follow up on expiring estimates",
      count: expiringCount,
      href: "/app/estimates?status=sent" as Route,
      detail: "Expiring within 7 days",
      tone: "warning",
    },
    {
      label: "Schedule active jobs",
      count: noNextVisitCount,
      href: "/app/jobs" as Route,
      detail: "Active jobs without a future visit",
      tone: "warning",
    },
    {
      label: "Clear exception lanes",
      count: exceptionJobCount + exceptionVisitCount,
      href: "/app/jobs" as Route,
      detail: `${exceptionJobCount} job${exceptionJobCount !== 1 ? "s" : ""} · ${exceptionVisitCount} visit${exceptionVisitCount !== 1 ? "s" : ""}`,
      tone: "warning",
    },
  ] satisfies ActionQueueItem[]).filter((item) => item.count > 0)
    .sort((a, b) => ({ danger: 0, warning: 1, default: 2 })[a.tone] - ({ danger: 0, warning: 1, default: 2 })[b.tone]);

  // ---------------------------------------------------------------------------
  // Pulse metrics strip — 4 KPIs visible to all admin/owner
  // ---------------------------------------------------------------------------

  const pulseMetrics: MetricCardData[] = [
    {
      label: "Revenue This Month",
      value: fmt(revenueThisMonth),
      sub: "Collected invoices",
      href: "/app/reports",
      variant: revenueThisMonth > 0 ? "success" : "default",
    },
    {
      label: "Open AR",
      value: fmt(openAR),
      sub: "Sent, partial & overdue",
      href: "/app/invoices",
      variant: openAR > 0 ? "alert" : "default",
    },
    {
      label: "Active Jobs",
      value: activeJobsCount,
      sub: "Scheduled or in progress",
      href: "/app/jobs",
      variant: "default",
    },
    {
      label: "Estimates Awaiting",
      value: awaitingCount,
      sub: "Sent, client not responded",
      href: "/app/estimates?status=sent",
      variant: awaitingCount > 0 ? "alert" : "default",
    },
  ];

  // ---------------------------------------------------------------------------
  // Shared inline style helpers
  // ---------------------------------------------------------------------------

  const metaLabel: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--fg-muted)",
    marginBottom: "var(--space-2)",
  };

  const bigNum: React.CSSProperties = {
    fontSize: "var(--text-3xl)",
    fontWeight: 700,
    letterSpacing: "-0.02em",
    color: "var(--fg)",
    lineHeight: 1.1,
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ padding: "var(--space-6) var(--space-6) var(--space-10)" }}>

      {/* ── Greeting + Quick Actions ──────────────────────────────────── */}
      <div style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--space-4)",
        flexWrap: "wrap",
        marginBottom: "var(--space-6)",
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, letterSpacing: "-0.01em" }}>
            Today
          </h1>
          <p style={{ margin: 0, marginTop: "var(--space-1)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            {greeting}{firstName ? `, ${firstName}` : ""} — {todayLabel}
          </p>
        </div>

        {/* Quick Actions */}
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
          <Link href={"/app/intake/new" as Route} className="p7-btn p7-btn-primary p7-btn-sm">
            + New Request
          </Link>
          <Link href={"/app/estimates/new" as Route} className="p7-btn p7-btn-secondary p7-btn-sm">
            + Estimate
          </Link>
          <Link href={"/app/invoices/new" as Route} className="p7-btn p7-btn-secondary p7-btn-sm">
            + Invoice
          </Link>
          <Link href={"/app/mileage/new" as Route} className="p7-btn p7-btn-secondary p7-btn-sm">
            + Mileage
          </Link>
          <Link
            href={"/app/requests" as Route}
            className="p7-btn p7-btn-secondary p7-btn-sm"
            style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}
          >
            Requests
            {pendingRequestsCount > 0 && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: "1.25rem",
                height: "1.25rem",
                borderRadius: "var(--radius-full)",
                background: "var(--color-red-600)",
                color: "#fff",
                fontSize: "var(--text-xs)",
                fontWeight: 700,
                lineHeight: 1,
                padding: "0 4px",
              }}>
                {pendingRequestsCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* ── Pulse Metrics (4 KPIs) ────────────────────────────────────── */}
      <MetricGrid metrics={pulseMetrics} />

      {pendingRequest && (
        <Card hover padding="lg" style={{ marginTop: "var(--space-6)" }}>
          <div className="ops-section-header">
            <h2 className="ops-section-title">Requests</h2>
            <span className="ops-section-count">{pendingRequestsCount}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ minWidth: 240, flex: "1 1 320px" }}>
              <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{pendingRequest.name}</div>
              <div style={{ marginTop: "var(--space-1)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                {pendingRequest.service_category.replaceAll("_", " ")} · {pendingRequest.service_description}
              </div>
              <div style={{ marginTop: "var(--space-1)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                Requested {fmtDate(pendingRequest.created_at)}{pendingRequest.city ? ` · ${pendingRequest.city}` : ""}
                {pendingRequest.preferred_time_slot ? ` · Preferred ${pendingRequest.preferred_time_slot}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
              <Link href={`/app/booking-requests/${pendingRequest.id}` as Route} className="p7-btn p7-btn-primary p7-btn-sm">
                Review Request →
              </Link>
              <Link href={"/app/requests" as Route} className="p7-btn p7-btn-secondary p7-btn-sm">
                View Queue
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* ── Main 2-column: Today's Schedule + Action Queue ────────────── */}
      <div className="home-two-col">

        {/* Today's Schedule */}
        <Card hover padding="lg">
          <div className="ops-section-header">
            <h2 className="ops-section-title">Today&apos;s Schedule</h2>
            <span className="ops-section-count">{todayVisits.length}</span>
          </div>
          {todayVisits.length === 0 ? (
            <EmptyState
              title="No visits scheduled today"
              description="The schedule will appear here when visits are booked."
            />
          ) : (
            <div className="ops-visit-list">
              {todayVisits.map((v) => (
                <Link key={v.id} href={`/app/visits/${v.id}` as Route} className="ops-visit-row">
                  <div className="ops-visit-time">
                    <span>{fmtTime(v.scheduled_start)}</span>
                  </div>
                  <div className="ops-visit-body">
                    <div className="ops-visit-client">{v.client_name}</div>
                    <div className="ops-visit-job">
                      {v.property_address ?? v.job_title}
                    </div>
                  </div>
                  <StatusBadge variant={v.status as StatusVariant}>
                    {v.status.replace("_", " ")}
                  </StatusBadge>
                </Link>
              ))}
            </div>
          )}
          <div style={{ marginTop: "var(--space-4)", textAlign: "right" }}>
            <Link
              href={"/app/schedule" as Route}
              style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
            >
              Full schedule →
            </Link>
          </div>
        </Card>

        {/* Action Queue */}
        <Card hover padding="lg">
          <div className="ops-section-header">
            <h2 className="ops-section-title">Action Queue</h2>
            <span className="ops-section-count">{actionQueue.length}</span>
          </div>
          {actionQueue.length === 0 ? (
            <EmptyState title="All clear" description="No urgent actions right now." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {actionQueue.map((item) => {
                const countColor =
                  item.tone === "danger"  ? "var(--color-red-600)"   :
                  item.tone === "warning" ? "var(--color-amber-600)" :
                  "var(--accent)";
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: "var(--space-3)",
                      alignItems: "center",
                      padding: "var(--space-3)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span>
                      <span style={{ display: "block", fontWeight: 600, fontSize: "var(--text-sm)" }}>
                        {item.label}
                      </span>
                      <span style={{ display: "block", color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
                        {item.detail}
                      </span>
                    </span>
                    <span style={{ color: countColor, fontWeight: 800, fontVariantNumeric: "tabular-nums", fontSize: "var(--text-lg)" }}>
                      {item.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* ── Owner: Business Health ─────────────────────────────────────── */}
      {isOwner && (
        <div style={{ marginTop: "var(--space-8)" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "var(--space-4)",
          }}>
            <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 700 }}>Business Health</h2>
            <Link
              href={"/app/reports" as Route}
              style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
            >
              Full reports →
            </Link>
          </div>

          <div className="home-owner-grid">

            {/* Revenue trend */}
            <Card padding="lg" style={{
              background: revenueChangePct >= 0 ? "var(--color-green-50)" : "var(--color-red-50)",
              borderColor: revenueChangePct >= 0 ? "var(--color-green-200)" : "var(--color-red-200)",
            }}>
              <div style={metaLabel}>Revenue This Month</div>
              <div style={bigNum}>{fmt(revenueThisMonth)}</div>
              <div style={{
                marginTop: "var(--space-2)",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: revenueChangePct >= 0 ? "var(--color-green-600)" : "var(--color-red-600)",
              }}>
                {revenueChangePct > 0 ? "↑" : revenueChangePct < 0 ? "↓" : "—"}{" "}
                {revenueChangePct !== 0 ? `${Math.abs(revenueChangePct)}% vs last month` : "Same as last month"}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                Last month: {fmt(lastMonthRev)}
              </div>
            </Card>

          </div>
        </div>
      )}

    </div>
  );
}
