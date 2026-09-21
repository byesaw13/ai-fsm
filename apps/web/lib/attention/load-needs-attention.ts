import type { Route } from "next";
import type { SessionPayload } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import {
  OPEN_OWNER_PROMISES_SQL,
  OWNER_PROMISE_ACTION_TYPE,
  customerPromiseBucket,
  toPromiseToneInput,
  type OpenOwnerPromiseRow,
} from "@/lib/captures/promise-queue";
import { loadCloseoutLeftovers } from "@/lib/attention/closeout-leftovers";

export type NeedsAttentionItem = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
};

type CountRow = { count: string };
type MoneyRow = { count: string; total_cents: string };
type ExceptionRow = { kind: string; count: string };

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

function fmt(cents: number | string): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Owner "Needs attention" buckets (was `/app/action-queue`). */
export async function loadNeedsAttention(session: SessionPayload): Promise<{
  items: NeedsAttentionItem[];
  openPromiseRows: OpenOwnerPromiseRow[];
}> {
  const accountId = session.accountId;
  const [
    draftInvoices,
    sentEstimates,
    expiringEstimates,
    expiredEstimates,
    depositsNeeded,
    jobsNoNextVisit,
    materialsNeeded,
    materialJobs,
    pendingRequests,
    overdueInvoices,
    exceptionRows,
    openPromiseRows,
    leftovers,
  ] = await Promise.all([
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
         AND status = 'draft'
         AND invoice_kind IN ('final', 'standard')`,
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status = 'sent'
         AND (expires_at IS NULL OR expires_at > NOW())`,
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status IN ('draft','sent')
         AND expires_at IS NOT NULL
         AND expires_at < NOW() + INTERVAL '7 days'`,
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1 AND status = 'expired'`,
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
         AND invoice_kind = 'deposit'
         AND status IN ('draft','sent','partial','overdue')`,
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
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
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(DISTINCT e.id)::text AS count
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.status = 'approved'
         AND j.status IN ('scheduled','in_progress')`,
      [accountId],
    ),
    queryForSession<{ id: string; job_id: string; title: string }>(
      session,
      `SELECT e.id, j.id AS job_id, j.title
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.status = 'approved'
         AND j.status IN ('scheduled','in_progress')
       ORDER BY e.updated_at DESC
       LIMIT 5`,
      [accountId],
    ),
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count
       FROM booking_requests
       WHERE account_id = $1 AND status = 'pending'`,
      [accountId],
    ),
    queryForSession<MoneyRow>(
      session,
      `SELECT COUNT(*)::text AS count,
              COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM invoices
       WHERE account_id = $1 AND status = 'overdue'`,
      [accountId],
    ),
    queryForSession<ExceptionRow>(
      session,
      `SELECT 'job' AS kind, COUNT(*)::text AS count FROM jobs WHERE account_id = $1 AND sub_status IS NOT NULL
       UNION ALL
       SELECT 'visit' AS kind, COUNT(*)::text AS count FROM visits WHERE account_id = $1 AND sub_status IS NOT NULL`,
      [accountId],
    ),
    queryForSession<OpenOwnerPromiseRow>(
      session,
      OPEN_OWNER_PROMISES_SQL,
      [accountId, OWNER_PROMISE_ACTION_TYPE],
    ),
    loadCloseoutLeftovers(session),
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

  const items = (
    [
      {
        label: "Finished, no invoice",
        count: leftovers.finishedUnbilled,
        href: "/app/invoices?status=draft" as Route,
        detail: "Jobs closed or marked done without an invoice",
        tone: "danger",
      },
      {
        label: "Open, no next visit",
        count: leftovers.openNoNextVisit,
        href: "/app/jobs" as Route,
        detail: "Coming-back jobs with no day on the calendar",
        tone: "warning",
      },
      {
        label: "Receipts not on a job",
        count: leftovers.unlinkedReceiptsToday,
        href: "/app/expenses" as Route,
        detail: "Today’s receipts still unattached",
        tone: "warning",
      },
      {
        label: "Miles not on a job",
        count: leftovers.untaggedClaimMiles,
        href: "/app/mileage" as Route,
        detail: "Odometer days in the last 14 days with no job tag",
        tone: "warning",
      },
      {
        label: "Draft bills",
        count: draftInvoiceCount,
        href: "/app/invoices?status=draft" as Route,
        detail: "Completed work waiting for a bill",
        tone: "warning",
      },
      {
        label: "Schedule jobs",
        count: scheduleCount,
        href: "/app/jobs" as Route,
        detail: "Approved or active jobs without a next visit",
        tone: "warning",
      },
      {
        label: "Follow up quotes",
        count: sentEstimateCount + expiringEstimateCount + expiredEstimateCount,
        href: "/app/estimates?status=sent" as Route,
        detail:
          expiredEstimateCount > 0
            ? `${expiredEstimateCount} expired — revise and resend${expiringEstimateCount > 0 ? "; some expire within 7 days" : ""}`
            : expiringEstimateCount > 0
              ? "Some expire within 7 days"
              : "Sent estimates awaiting response",
        tone: "warning",
      },
      {
        label: "Collect deposits",
        count: depositCount,
        href: "/app/invoices?kind=deposit" as Route,
        detail: "Deposit invoices not fully collected",
        tone: "danger",
      },
      {
        label: "Order materials",
        count: materialCount,
        href: (materialJobs.length === 1
          ? `/app/jobs/${materialJobs[0].job_id}/materials?tab=buy`
          : "/app/materials") as Route,
        detail:
          materialJobs.length === 1
            ? `Buy list: ${materialJobs[0].title}`
            : "Open buy lists for approved active jobs",
        tone: "warning",
      },
      {
        label: "Review requests",
        count: requestCount,
        href: "/app/requests" as Route,
        detail: "Needs routing or follow-up",
        tone: "warning",
      },
      {
        label: "Collect overdue bills",
        count: overdueCount,
        href: "/app/invoices?status=overdue" as Route,
        detail: `${fmt(overdueTotal)} outstanding`,
        tone: "danger",
      },
      {
        label: "Clear exception lanes",
        count: exceptionJobCount + exceptionVisitCount,
        href: "/app/jobs" as Route,
        detail: `${exceptionJobCount} job${exceptionJobCount !== 1 ? "s" : ""} / ${exceptionVisitCount} visit${exceptionVisitCount !== 1 ? "s" : ""}`,
        tone: "warning",
      },
      customerPromiseBucket(toPromiseToneInput(openPromiseRows)),
    ] satisfies NeedsAttentionItem[]
  )
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        ({ danger: 0, warning: 1, default: 2 })[a.tone] -
        ({ danger: 0, warning: 1, default: 2 })[b.tone],
    );

  return { items, openPromiseRows };
}
