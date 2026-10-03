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
import { attentionPriority, compareNeedsAttention } from "@/lib/attention/priority";
import { HOLD_SEND_BILL_LABEL, CUSTOMER_REPORTS_LABEL } from "@/lib/attention/surfaces";
import { REPORT_QUEUE_PARAMS, REPORT_QUEUE_WHERE } from "@/lib/job-reports/queue";

export type NeedsAttentionItem = {
  label: string;
  count: number;
  href: Route;
  detail: string;
  tone: "danger" | "warning" | "default";
  /** What to do, shown in place of the bucket name. */
  action: string;
  /** Why this item is where it is in the list. */
  priorityReason: string;
};

function presentAttention(
  item: Omit<NeedsAttentionItem, "action" | "priorityReason">,
  hints: { promiseTitle: string | null; materialTitle: string | null },
): NeedsAttentionItem {
  const priority = attentionPriority(item);
  let action = item.label;
  if (item.label === HOLD_SEND_BILL_LABEL) action = "Send the bill";
  if (item.label === "Collect overdue bills") {
    action = `Collect overdue bills — ${item.detail.replace(/ outstanding$/, "")}`;
  }
  if (item.label === "Collect deposits") action = "Collect the deposit";
  if (item.label === "Order materials" && hints.materialTitle) {
    action = `Order materials — ${hints.materialTitle}`;
  }
  if (item.label === "Customer Promises" && hints.promiseTitle) action = hints.promiseTitle;
  if (item.label === "Open, no next visit" || item.label === "Schedule jobs") {
    action = "Schedule the next visit";
  }
  if (item.label === "Review requests") action = "Decide the next step";
  if (item.label === "Draft bills") action = "Send the draft bill";
  return { ...item, action, priorityReason: priority.reason };
}

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
    reportQueue,
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
    // TASK-163: same predicate as the queue page, so the count always matches.
    queryForSession<CountRow>(
      session,
      `SELECT COUNT(*)::text AS count FROM jobs j WHERE ${REPORT_QUEUE_WHERE}`,
      REPORT_QUEUE_PARAMS(accountId),
    ),
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

  const rawItems: Array<Omit<NeedsAttentionItem, "action" | "priorityReason">> = [
      {
        label: HOLD_SEND_BILL_LABEL,
        count: leftovers.finishedUnbilled,
        href: "/app/invoices?status=draft" as Route,
        detail: "Work is filed. The bill is still on Hold — send it.",
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
      {
        label: CUSTOMER_REPORTS_LABEL,
        count: parseN(reportQueue[0]),
        href: "/app/jobs/customer-reports" as Route,
        detail: "Finished jobs with photos the customer hasn't seen",
        tone: "default",
      },
      customerPromiseBucket(toPromiseToneInput(openPromiseRows)),
  ];
  const items = rawItems
    .filter((item) => item.count > 0)
    .map((item) =>
      presentAttention(item, {
        promiseTitle: openPromiseRows.length === 1 ? openPromiseRows[0].title : null,
        materialTitle: materialJobs.length === 1 ? materialJobs[0].title : null,
      }),
    )
    .sort(compareNeedsAttention);

  return { items, openPromiseRows };
}
