import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { queryForSession } from "@/lib/db";
import { LinkButton, PageContainer, PageHeader } from "@/components/ui";
import { OwnerDashboard } from "./OwnerDashboard";
import type { CommandVisit, CountAction, MaterialJob } from "./WorkdayPanel";

export const dynamic = "force-dynamic";

type CountRow = { count: string };

function parseN(row: CountRow | undefined | null): number {
  return parseInt(row?.count ?? "0", 10);
}

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [
    todayJobs,
    tomorrowJobs,
    draftInvoiceCountRows,
    scheduleApprovedCountRows,
    estimateFollowUpCountRows,
    depositCountRows,
    materialCountRows,
    materialJobs,
    outstandingInvoicesCentsRows,
    pendingDepositsCentsRows,
    paidThisMonthCentsRows,
    pendingSegmentRows,
  ] = await Promise.all([
    queryForSession<CommandVisit>(session,
      `SELECT DISTINCT ON (j.id)
              j.id, j.title, j.status,
              c.name AS client_name,
              p.address AS property_address,
              v.id AS visit_id,
              v.scheduled_start::text AS scheduled_start,
              v.status AS visit_status,
              v.sub_status
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = j.account_id
       WHERE j.account_id = $1
         AND j.status IN ('draft','quoted','scheduled','in_progress')
         AND v.status IN ('scheduled','arrived','in_progress')
         AND v.scheduled_start::date = CURRENT_DATE
       ORDER BY j.id, v.scheduled_start ASC
       LIMIT 10`,
      [accountId]),

    queryForSession<CommandVisit>(session,
      `SELECT DISTINCT ON (j.id)
              j.id, j.title, j.status,
              c.name AS client_name,
              p.address AS property_address,
              v.id AS visit_id,
              v.scheduled_start::text AS scheduled_start,
              v.status AS visit_status,
              v.sub_status
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       LEFT JOIN properties p ON p.id = j.property_id
       LEFT JOIN visits v ON v.job_id = j.id AND v.account_id = j.account_id
       WHERE j.account_id = $1
         AND v.status IN ('scheduled','arrived','in_progress')
         AND v.scheduled_start::date = CURRENT_DATE + interval '1 day'
       ORDER BY j.id, v.scheduled_start ASC
       LIMIT 3`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1 AND status = 'draft' AND invoice_kind IN ('final', 'standard')`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM jobs
       WHERE account_id = $1
         AND status IN ('draft','quoted','scheduled','in_progress')
         AND NOT EXISTS (
           SELECT 1 FROM visits
           WHERE visits.job_id = jobs.id
             AND visits.status IN ('scheduled','arrived','in_progress')
             AND visits.scheduled_start >= CURRENT_DATE
         )`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND status = 'sent'
         AND (expires_at IS NULL OR expires_at >= CURRENT_DATE)`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM invoices
       WHERE account_id = $1
         AND invoice_kind = 'deposit'
         AND status IN ('draft','sent','partial','overdue')`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COUNT(DISTINCT e.id)::text AS count
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
       WHERE e.account_id = $1
         AND e.status = 'approved'
         AND j.status IN ('scheduled','in_progress')`,
      [accountId]),

    queryForSession<MaterialJob>(session,
      `SELECT e.id, j.id AS job_id, j.title, c.name AS client_name
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id AND j.account_id = e.account_id
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE e.account_id = $1
         AND e.status = 'approved'
         AND j.status IN ('scheduled','in_progress')
       ORDER BY e.updated_at DESC
       LIMIT 5`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COALESCE(SUM(total_cents - paid_cents), 0)::text AS count
       FROM invoices
       WHERE account_id = $1 AND status IN ('sent', 'partial', 'overdue')`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COALESCE(SUM(total_cents - paid_cents), 0)::text AS count
       FROM invoices
       WHERE account_id = $1 AND invoice_kind = 'deposit' AND status IN ('draft', 'sent', 'partial', 'overdue')`,
      [accountId]),

    queryForSession<CountRow>(session,
      `SELECT COALESCE(SUM(amount_cents), 0)::text AS count
       FROM payments
       WHERE account_id = $1 AND status = 'paid'
         AND received_at >= DATE_TRUNC('month', CURRENT_DATE)`,
      [accountId]),

    // TASK-024: ended, still-unlabelled location segments waiting to be logged.
    queryForSession<CountRow>(session,
      `SELECT COUNT(*)::text AS count
       FROM location_segments
       WHERE account_id = $1
         AND segment_date = CURRENT_DATE
         AND status = 'provisional'
         AND ended_at IS NOT NULL`,
      [accountId]),
  ]);

  const draftInvoices = parseN(draftInvoiceCountRows[0]);
  const deposits = parseN(depositCountRows[0]);
  const materialCount = parseN(materialCountRows[0]);
  const pendingSegments = parseN(pendingSegmentRows[0]);

  const outstandingInvoicesCents = parseN(outstandingInvoicesCentsRows[0]);
  const pendingDepositsCents = parseN(pendingDepositsCentsRows[0]);
  const paidThisMonthCents = parseN(paidThisMonthCentsRows[0]);

  const actionQueue = ([
    {
      label: "Review Draft Invoices",
      count: draftInvoices,
      href: "/app/invoices?status=draft" as Route,
      detail: "Draft invoices awaiting review",
      tone: "warning",
    },
    {
      label: "Schedule Approved Jobs",
      count: parseN(scheduleApprovedCountRows[0]),
      href: "/app/jobs" as Route,
      detail: "Active work without a next visit",
      tone: "warning",
    },
    {
      label: "Follow Up Estimates",
      count: parseN(estimateFollowUpCountRows[0]),
      href: "/app/estimates?status=sent" as Route,
      detail: "Sent estimates awaiting response",
      tone: "warning",
    },
    {
      label: "Collect Deposits",
      count: deposits,
      href: "/app/invoices?kind=deposit" as Route,
      detail: "Deposit invoices not fully collected",
      tone: "danger",
    },
    {
      label: "Order Materials",
      count: materialCount,
      href: "/app/estimates?status=approved" as Route,
      detail: "Approved jobs with materials to stage",
      tone: "warning",
    },
    {
      label: "Label Captured Locations",
      count: pendingSegments,
      href: "/app/timeline" as Route,
      detail: "Auto-recorded stops & drives to log to your day",
      tone: "default",
    },
  ] satisfies CountAction[])
    .filter((item) => item.count > 0)
    .sort((a, b) => ({ danger: 0, warning: 1, default: 2 })[a.tone] - ({ danger: 0, warning: 1, default: 2 })[b.tone]);

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        subtitle={todayLabel}
        actions={
          <>
            <LinkButton href="/app/my-day" variant="secondary" size="sm">My Day</LinkButton>
            <LinkButton href="/app/intake/new" variant="primary" size="sm">+ New Request</LinkButton>
          </>
        }
      />
      <OwnerDashboard
        actionQueue={actionQueue}
        todayJobs={todayJobs}
        materialCount={materialCount}
        materialJobs={materialJobs}
        tomorrowJobs={tomorrowJobs}
        outstandingInvoicesCents={outstandingInvoicesCents}
        pendingDepositsCents={pendingDepositsCents}
        paidThisMonthCents={paidThisMonthCents}
      />
    </PageContainer>
  );
}
