import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

type CountRow = { count: string };
type MoneyRow = { count: string; total_cents: string };
type ExceptionRow = { kind: string; count: string };

type QueueItem = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
};

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

function fmt(cents: number | string): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export default async function ActionQueuePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const [
    draftInvoices,
    sentEstimates,
    expiringEstimates,
    expiredEstimates,
    depositsNeeded,
    jobsNoNextVisit,
    materialsNeeded,
    pendingRequests,
    overdueInvoices,
    exceptionRows,
  ] = await Promise.all([
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
         AND status = 'draft'
         AND invoice_kind IN ('final', 'standard')`,
      [accountId]),
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status = 'sent'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [accountId]),
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status IN ('draft','sent')
         AND expires_at IS NOT NULL
         AND expires_at < NOW() + INTERVAL '7 days'`,
      [accountId]),
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1 AND status = 'expired'`,
      [accountId]),
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
         AND invoice_kind = 'deposit'
         AND status IN ('draft','sent','partial','overdue')`,
      [accountId]),
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
    queryForSession<CountRow>(session,
      `SELECT COUNT(DISTINCT e.id)::text AS count
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.status = 'approved'
         AND j.status IN ('scheduled','in_progress')`,
      [accountId]),
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM booking_requests
       WHERE account_id = $1 AND status = 'pending'`,
      [accountId]),
    queryForSession<MoneyRow>(session,
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status = 'overdue'`,
      [accountId]),
    queryForSession<ExceptionRow>(session,
      `SELECT 'job' AS kind, COUNT(*)::text AS count FROM jobs WHERE account_id = $1 AND sub_status IS NOT NULL
       UNION ALL
       SELECT 'visit' AS kind, COUNT(*)::text AS count FROM visits WHERE account_id = $1 AND sub_status IS NOT NULL`,
      [accountId]),
  ]);

  const draftInvoiceCount = parseN(draftInvoices[0]);
  const sentEstimateCount = parseN(sentEstimates[0]);
  const expiringEstimateCount = parseN(expiringEstimates[0]);
  const expiredEstimateCount = parseN(expiredEstimates[0]);
  const depositCount = parseN(depositsNeeded[0]);
  const scheduleCount = parseN(jobsNoNextVisit[0]);
  const materialCount = parseN(materialsNeeded[0]);
  const requestCount = parseN(pendingRequests[0]);
  const overdueCount = parseN(overdueInvoices[0]);
  const overdueTotal = parseInt(overdueInvoices[0]?.total_cents ?? "0", 10);
  const exceptionJobCount = parseN(exceptionRows.find((r) => r.kind === "job"));
  const exceptionVisitCount = parseN(exceptionRows.find((r) => r.kind === "visit"));

  const items = ([
    { label: "Review Draft Invoices", count: draftInvoiceCount, href: "/app/invoices?status=draft" as Route, detail: "Completed work waiting for invoice review", tone: "warning" },
    { label: "Schedule Approved Jobs", count: scheduleCount, href: "/app/jobs" as Route, detail: "Approved or active jobs without a next visit", tone: "warning" },
    {
      label: "Follow Up Estimates",
      count: sentEstimateCount + expiringEstimateCount + expiredEstimateCount,
      href: "/app/estimates?status=sent" as Route,
      detail: expiredEstimateCount > 0
        ? `${expiredEstimateCount} expired — revise and resend${expiringEstimateCount > 0 ? "; some expire within 7 days" : ""}`
        : expiringEstimateCount > 0
          ? "Some expire within 7 days"
          : "Sent estimates awaiting response",
      tone: "warning",
    },
    { label: "Collect Deposits", count: depositCount, href: "/app/invoices?kind=deposit" as Route, detail: "Deposit invoices not fully collected", tone: "danger" },
    { label: "Order Materials", count: materialCount, href: "/app/estimates?status=approved" as Route, detail: "Approved jobs with materials to stage", tone: "warning" },
    { label: "Review Requests", count: requestCount, href: "/app/requests" as Route, detail: "Needs routing or follow-up", tone: "warning" },
    { label: "Collect Overdue Invoices", count: overdueCount, href: "/app/invoices?status=overdue" as Route, detail: `${fmt(overdueTotal)} outstanding`, tone: "danger" },
    { label: "Clear Exception Lanes", count: exceptionJobCount + exceptionVisitCount, href: "/app/jobs" as Route, detail: `${exceptionJobCount} job${exceptionJobCount !== 1 ? "s" : ""} / ${exceptionVisitCount} visit${exceptionVisitCount !== 1 ? "s" : ""}`, tone: "warning" },
  ] satisfies QueueItem[])
    .filter((item) => item.count > 0)
    .sort((a, b) => ({ danger: 0, warning: 1, default: 2 })[a.tone] - ({ danger: 0, warning: 1, default: 2 })[b.tone]);

  return (
    <div style={{ padding: "var(--space-4) var(--space-4) var(--space-12)", display: "flex", flexDirection: "column", gap: "var(--space-5)", maxWidth: 760 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800 }}>Action Queue</h1>
      </header>

      {items.length === 0 ? (
        <EmptyState title="All clear" description="No execution actions need attention right now." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {items.map((item) => (
            <Link key={item.label} href={item.href} className="mobile-work-item">
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <b>{item.count}</b>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
