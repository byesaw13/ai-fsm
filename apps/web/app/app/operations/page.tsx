import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { Card, EmptyState, PageContainer, PageHeader, StatusBadge } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

type CountRow = { count: string };
type StageRow = { status: string; count: string };
type VisitRow = {
  id: string;
  scheduled_start: string;
  status: string;
  job_title: string;
  client_name: string;
};
type OverdueInvoiceRow = { count: string; total_cents: string };
type ExceptionRow = { kind: "job" | "visit"; count: string };
type RevenueRow = { total_cents: string };

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
};

const STAGE_ORDER = ["draft", "quoted", "scheduled", "in_progress", "completed", "invoiced"];

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function parseCount(row?: CountRow | null): number {
  return parseInt(row?.count ?? "0", 10);
}

function panelTone(count: number): "default" | "alert" {
  return count > 0 ? "alert" : "default";
}

export default async function OperationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;

  const [
    bookingQueueRows,
    stageRows,
    todayVisits,
    overdueInvoicesRows,
    expiringEstimatesRows,
    exceptionRows,
    needsInfoRows,
    revenueRows,
    scheduledThisWeekRows,
  ] = await Promise.all([
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM booking_requests
       WHERE account_id = $1 AND status = 'pending'`,
      [accountId]
    ),
    query<StageRow>(
      `SELECT status, COUNT(*)::text AS count
       FROM jobs
       WHERE account_id = $1
         AND status IN ('draft','quoted','scheduled','in_progress','completed','invoiced')
       GROUP BY status`,
      [accountId]
    ),
    query<VisitRow>(
      `SELECT v.id,
              v.scheduled_start::text AS scheduled_start,
              v.status,
              j.title AS job_title,
              c.name AS client_name
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       JOIN clients c ON c.id = j.client_id
       WHERE v.account_id = $1
         AND v.scheduled_start::date = CURRENT_DATE
       ORDER BY v.scheduled_start ASC`,
      [accountId]
    ),
    query<OverdueInvoiceRow>(
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status = 'overdue'`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status IN ('draft','sent')
         AND expires_at IS NOT NULL
         AND expires_at < NOW() + INTERVAL '7 days'`,
      [accountId]
    ),
    query<ExceptionRow>(
      `SELECT 'job' AS kind, COUNT(*)::text AS count
         FROM jobs
        WHERE account_id = $1 AND sub_status IS NOT NULL
       UNION ALL
       SELECT 'visit' AS kind, COUNT(*)::text AS count
         FROM visits
        WHERE account_id = $1 AND sub_status IS NOT NULL`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM booking_requests
       WHERE account_id = $1 AND status = 'needs_info'`,
      [accountId]
    ),
    query<RevenueRow>(
      `SELECT COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1
         AND status IN ('partial','paid')
         AND created_at >= date_trunc('month', NOW())`,
      [accountId]
    ),
    query<CountRow>(
      `SELECT COUNT(*)::text AS count
       FROM visits
       WHERE account_id = $1
         AND scheduled_start::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 6`,
      [accountId]
    ),
  ]);

  const stageMap = new Map(stageRows.map((row) => [row.status, parseInt(row.count, 10)]));
  const stageMetrics = STAGE_ORDER.map((status) => ({
    status,
    count: stageMap.get(status) ?? 0,
  }));
  const activeJobs = stageMetrics.reduce((sum, row) => sum + row.count, 0);
  const activeJobSummary = stageMetrics
    .filter((row) => row.count > 0)
    .map((row) => `${STAGE_LABELS[row.status]} ${row.count}`)
    .join(" · ");

  const bookingQueueCount = parseCount(bookingQueueRows[0]);
  const todayVisitCount = todayVisits.length;
  const overdueInvoiceCount = parseCount(overdueInvoicesRows[0]);
  const overdueInvoiceTotal = parseInt(overdueInvoicesRows[0]?.total_cents ?? "0", 10);
  const expiringEstimateCount = parseCount(expiringEstimatesRows[0]);
  const needsInfoCount = parseCount(needsInfoRows[0]);
  const revenueThisMonth = parseInt(revenueRows[0]?.total_cents ?? "0", 10);
  const scheduledThisWeekCount = parseCount(scheduledThisWeekRows[0]);
  const exceptionJobCount = parseCount(exceptionRows.find((row) => row.kind === "job"));
  const exceptionVisitCount = parseCount(exceptionRows.find((row) => row.kind === "visit"));
  const exceptionTotalCount = exceptionJobCount + exceptionVisitCount;

  return (
    <PageContainer>
      <PageHeader
        title="Operations Dashboard"
        subtitle="Live queue, visits, billing, and exceptions"
        actions={(
          <Link href={"/app/booking-requests" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)", fontWeight: 600, textDecoration: "none" }}>
            Booking queue →
          </Link>
        )}
      />

      <div className="ops-grid">
        <MetricPanel title="Booking Queue" value={bookingQueueCount} sub="Pending requests" href="/app/booking-requests" tone={panelTone(bookingQueueCount)} linkLabel="View queue" />
        <MetricPanel title="Active Stage Counts" value={activeJobs} sub={activeJobSummary || "No active jobs"} href="/app/jobs" tone={panelTone(activeJobs)} linkLabel="Open jobs" />
        <MetricPanel title="Today's Visits" value={todayVisitCount} sub="Scheduled for today" href="/app/schedule" tone={panelTone(todayVisitCount)} linkLabel="Open schedule" />
        <MetricPanel title="Overdue Invoices" value={overdueInvoiceCount} sub={overdueInvoiceCount > 0 ? `${formatMoney(overdueInvoiceTotal)} total` : "None overdue"} href="/app/invoices?status=overdue" tone={panelTone(overdueInvoiceCount)} linkLabel="Open invoices" />
        <MetricPanel title="Open Estimates" value={expiringEstimateCount} sub="Expiring within 7 days" href="/app/estimates?status=sent" tone={panelTone(expiringEstimateCount)} linkLabel="Open estimates" />
        <MetricPanel title="Exception Lanes" value={exceptionTotalCount} sub={`${exceptionJobCount} jobs · ${exceptionVisitCount} visits`} href="/app/jobs" tone={panelTone(exceptionTotalCount)} linkLabel="Review exceptions" />
        <MetricPanel title="Needs Info" value={needsInfoCount} sub="Unreviewed booking requests" href="/app/booking-requests?status=needs_info" tone={panelTone(needsInfoCount)} linkLabel="Review requests" />
        <MetricPanel title="Revenue This Month" value={formatMoney(revenueThisMonth)} sub="Collected invoices" href="/app/reports" tone={revenueThisMonth > 0 ? "success" : "default"} linkLabel="Open reports" />
        <MetricPanel title="Scheduled This Week" value={scheduledThisWeekCount} sub="Visits from today through 6 days out" href="/app/schedule" tone={panelTone(scheduledThisWeekCount)} linkLabel="Open schedule" />
      </div>

      <Card hover padding="lg" className="ops-wide-card">
        <div className="ops-section-header">
          <h2 className="ops-section-title">Today&apos;s Schedule</h2>
          <span className="ops-section-count">{todayVisitCount}</span>
        </div>
        {todayVisits.length === 0 ? (
          <EmptyState title="No visits scheduled today" description="The schedule will appear here when visits are booked." />
        ) : (
          <div className="ops-visit-list">
            {todayVisits.map((visit) => (
              <Link key={visit.id} href={`/app/visits/${visit.id}` as Route} className="ops-visit-row">
                <div className="ops-visit-time">
                  <span>{formatTime(visit.scheduled_start)}</span>
                  <span>{formatDate(visit.scheduled_start)}</span>
                </div>
                <div className="ops-visit-body">
                  <div className="ops-visit-client">{visit.client_name}</div>
                  <div className="ops-visit-job">{visit.job_title}</div>
                </div>
                <StatusBadge variant={visit.status as StatusVariant}>{visit.status.replace("_", " ")}</StatusBadge>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card hover padding="lg" className="ops-wide-card">
        <div className="ops-section-header">
          <h2 className="ops-section-title">Exceptions &amp; Alerts</h2>
        </div>
        <div className="ops-alert-grid">
          <div className="ops-alert-item">
            <div className="ops-alert-label">Overdue invoices</div>
            <div className="ops-alert-value">{overdueInvoiceCount}</div>
            <div className="ops-alert-sub">{overdueInvoiceCount > 0 ? `${formatMoney(overdueInvoiceTotal)} outstanding` : "None due"}</div>
            <Link href={"/app/invoices?status=overdue" as Route} className="ops-alert-link">View overdue invoices</Link>
          </div>
          <div className="ops-alert-item">
            <div className="ops-alert-label">Expiring estimates</div>
            <div className="ops-alert-value">{expiringEstimateCount}</div>
            <div className="ops-alert-sub">Sent or draft estimates due within 7 days</div>
            <Link href={"/app/estimates?status=sent" as Route} className="ops-alert-link">View estimates</Link>
          </div>
          <div className="ops-alert-item">
            <div className="ops-alert-label">Exception lanes</div>
            <div className="ops-alert-value">{exceptionTotalCount}</div>
            <div className="ops-alert-sub">{exceptionJobCount} jobs and {exceptionVisitCount} visits with sub-status</div>
            <div className="ops-alert-links">
              <Link href={"/app/jobs" as Route} className="ops-alert-link">Jobs</Link>
              <Link href={"/app/visits" as Route} className="ops-alert-link">Visits</Link>
            </div>
          </div>
        </div>
      </Card>

    </PageContainer>
  );
}

interface MetricPanelProps {
  title: string;
  value: number | string;
  sub: string;
  href: string;
  tone: "default" | "alert" | "success";
  linkLabel: string;
}

function MetricPanel({ title, value, sub, href, tone, linkLabel }: MetricPanelProps) {
  const toneClass = tone === "alert" ? "ops-panel-alert" : tone === "success" ? "ops-panel-success" : "";

  return (
    <Link href={href as Route} style={{ textDecoration: "none", color: "inherit" }}>
      <Card hover padding="lg" className={toneClass}>
        <div className="ops-panel">
          <div className="ops-panel-title">{title}</div>
          <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)", lineHeight: 1, color: "var(--fg)", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </div>
          <div className="ops-panel-sub">{sub}</div>
          <div style={{ marginTop: "auto", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)" }}>
            {linkLabel} →
          </div>
        </div>
      </Card>
    </Link>
  );
}
