import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { getPool, queryForSession, queryOneForSession } from "@/lib/db";
import { formatVisitTime, isVisitOverdue } from "@/lib/visits/formatting";
import {
  canManageExpenses,
  canTransitionJob,
  canCreateVisit,
  canDeleteRecords,
  canCreateEstimates,
} from "@/lib/auth/permissions";
import { jobTransitions, JOB_STATUS_LABELS } from "@ai-fsm/domain";
import type { Job, Visit, JobStatus, JobAcceptanceCategory, JobIntakeDecision } from "@ai-fsm/domain";
import { JOB_SUB_STATUSES, SUB_STATUS_LABELS } from "@ai-fsm/domain";
import { JobTransitionForm } from "./JobTransitionForm";
import { DeleteJobButton } from "./DeleteJobButton";
import { JobEditForm } from "./JobEditFormWrapper";
import { JobIntakePanel } from "./JobIntakePanel";
import { AssetLinksPanel } from "./AssetLinksPanel";
import { LinkedDocuments } from "@/components/documents/LinkedDocuments";
import { ProjectWhatNext } from "./ProjectWhatNext";
import { ProjectOverview } from "./ProjectOverview";
import { ProjectUnplannedTasks } from "./ProjectUnplannedTasks";
import { DailyRecapPanel } from "@/app/app/field/DailyRecapPanel";
import { UseTmBriefingButton } from "./UseTmBriefingButton";
import { buildJobTmBriefing } from "@/lib/estimates/job-tm-briefing";
import { VendorCoordinationCard } from "./VendorCoordinationCard";
import { JobWorkOrdersPanel, type JobWorkOrderRow } from "./JobWorkOrdersPanel";
import { JobTasksPanel } from "./JobTasksPanel";
import { loadJobTaskProgress } from "@/lib/work-orders/job-tasks";
import { LinkForgottenExpensesPanel } from "@/components/invoices/LinkForgottenExpensesPanel";
import { fetchJobMaterialExpenses, type JobMaterialExpenseWithLines } from "@/lib/invoices/job-expenses";
import { withExpenseContext } from "@/lib/expenses/db";
import { JobMaterialsPanel } from "./JobMaterialsPanel";
import { SubStatusSelect } from "@/components/SubStatusSelect";
import { isHomeboxEnabled } from "@/lib/homebox/client";
import { withAssetContext, listAssetLinks } from "@/lib/homebox/db";
import { derivePipelineStage, isReadyForCloseout } from "@ai-fsm/domain";
import { visitTypeLabel } from "@/lib/visits/labels";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  LinkButton,
  Timeline,
  Card,
  SectionHeader,
  EmptyState,
} from "@/components/ui";
import type { TimelineEntryData, StatusVariant } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  formatMinutesAsHoursMinutes,
  laborCostForMargin,
  mapTrackedLaborDayRows,
  type TrackedLaborDay,
} from "@/lib/invoices/tracked-labor";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";
import { buildAddDayHref } from "@/lib/jobs/next-schedule-day";
import {
  detectTaskScheduleMismatch,
  pickAssessmentVisitId,
  pickNextExecutionVisit,
  type WorkOrderBoardRow,
} from "@/lib/jobs/project-launch";
import {
  findUnplannedOpenTasks,
  groupPlannedTasksByVisit,
  truncateTaskChipLabel,
  type VisitPlanDay,
} from "@/lib/jobs/project-board";

export const dynamic = "force-dynamic";

function formatWorkDayLabel(isoDate: string): string {
  // session_date is a calendar date; parse as noon UTC so the calendar day label
  // is stable regardless of container TZ (do not shift the work date).
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Server-rendered times must use business TZ — container is UTC (off by 4h in EDT). */
function formatClockRange(start: string | Date, end: string | Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  };
  const s = new Date(start).toLocaleTimeString("en-US", opts);
  const e = new Date(end).toLocaleTimeString("en-US", opts);
  return `${s} – ${e}`;
}

type JobRow = Job & {
  client_name: string | null;
  client_phone: string | null;
  property_address: string | null;
  job_category: JobAcceptanceCategory | null;
  strategy_fit: number | null;
  scope_clarity: number | null;
  margin_confidence: number | null;
  schedule_impact: number | null;
  quality_fit: number | null;
  intake_decision: JobIntakeDecision | null;
  intake_notes: string | null;
  sub_status: string | null;
  vendor_coordination: "referral" | "concierge" | null;
  concierge_fee_cents: number | null;
};
type VisitRow = Visit & {
  assigned_user_name: string | null;
  visit_type: string;
  work_order_id?: string | null;
};

function isExecutionVisit(visit: VisitRow): boolean {
  return visit.visit_type === "standard" || visit.visit_type === "punch_list";
}

function isPreSaleSiteVisit(visit: VisitRow): boolean {
  return visit.visit_type === "site_visit";
}
type DbWorkOrderRow = {
  id: string;
  title: string;
  status: string;
  visit_count: string;
  active_visit_count: string;
  task_total: string;
  task_open: string;
  [key: string]: unknown;
};


function AdvancedDetails({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-card)",
        padding: "var(--space-3)",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontSize: "var(--text-sm)",
          fontWeight: 700,
          color: "var(--fg)",
        }}
      >
        {title}
      </summary>
      <div style={{ marginTop: "var(--space-3)" }}>
        {children}
      </div>
    </details>
  );
}

function MobileJobAction({ href, label, detail, primary = false }: { href: Route; label: string; detail?: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`mobile-work-item ${primary ? "mobile-work-item-primary" : ""}`}
      style={{ minHeight: 72 }}
    >
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <b>Open</b>
    </Link>
  );
}

function MobileJobExternalAction({ href, label, detail }: { href: string; label: string; detail?: string }) {
  return (
    <a href={href} className="mobile-work-item" style={{ minHeight: 72 }} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined}>
      <span>
        <strong>{label}</strong>
        {detail && <small>{detail}</small>}
      </span>
      <b>Go</b>
    </a>
  );
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const job = await queryOneForSession<JobRow & {
    property_city: string | null;
    property_state: string | null;
  }>(
    session,
    `SELECT j.*, c.name AS client_name, c.phone AS client_phone,
            p.address AS property_address, p.city AS property_city, p.state AS property_state
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     LEFT JOIN properties p ON p.id = j.property_id
     WHERE j.id = $1 AND j.account_id = $2`,
    [id, session.accountId]
  );

  if (!job) notFound();

  // tech: only see this job if they have an assigned visit
  if (session.role === "tech") {
    const assigned = await queryOneForSession(
      session,
      `SELECT id FROM visits WHERE job_id = $1 AND account_id = $2 AND assigned_user_id = $3 LIMIT 1`,
      [id, session.accountId, session.userId]
    );
    if (!assigned) notFound();
  }

  // Task progress for multi-day jobs (project hub).
  let taskProgress = {
    total: 0,
    required_total: 0,
    done: 0,
    required_done: 0,
    percent: 0,
    tasks: [] as Awaited<ReturnType<typeof loadJobTaskProgress>>["tasks"],
  };
  {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query(
        `SELECT set_config('app.current_user_id',$1,true), set_config('app.current_account_id',$2,true), set_config('app.current_role',$3,true)`,
        [session.userId, session.accountId, session.role],
      );
      taskProgress = await loadJobTaskProgress(client, id, session.accountId);
    } finally {
      client.release();
    }
  }

  const homeboxEnabled = isHomeboxEnabled();

  const [visits, workOrders, commercialCounts, assetLinks, jobMaterialExpenses, trackedLaborDayRows, visitTaskRows] =
    await Promise.all([
    session.role === "tech"
      ? queryForSession<VisitRow>(
          session,
          `SELECT v.*, u.full_name AS assigned_user_name
           FROM visits v
           LEFT JOIN users u ON u.id = v.assigned_user_id
           WHERE v.job_id = $1 AND v.account_id = $2 AND v.assigned_user_id = $3
           ORDER BY v.scheduled_start ASC`,
          [id, session.accountId, session.userId]
        )
      : queryForSession<VisitRow>(
          session,
          `SELECT v.*, u.full_name AS assigned_user_name
           FROM visits v
           LEFT JOIN users u ON u.id = v.assigned_user_id
           WHERE v.job_id = $1 AND v.account_id = $2
           ORDER BY v.scheduled_start ASC`,
          [id, session.accountId]
        ),
    session.role !== "tech"
      ? queryForSession<DbWorkOrderRow>(
          session,
          `SELECT w.id, w.title, w.status,
                  COUNT(v.id)::text AS visit_count,
                  COUNT(v.id) FILTER (
                    WHERE v.status NOT IN ('completed','cancelled')
                  )::text AS active_visit_count,
                  (
                    SELECT COUNT(*)::text FROM work_order_tasks t
                    WHERE t.work_order_id = w.id AND t.account_id = w.account_id
                  ) AS task_total,
                  (
                    SELECT COUNT(*)::text FROM work_order_tasks t
                    WHERE t.work_order_id = w.id AND t.account_id = w.account_id
                      AND t.completed = false AND t.status <> 'done'
                  ) AS task_open
           FROM work_orders w
           LEFT JOIN visits v ON v.work_order_id = w.id
           WHERE w.job_id = $1 AND w.account_id = $2 AND w.status <> 'draft'
           GROUP BY w.id
           ORDER BY w.created_at ASC`,
          [id, session.accountId],
        )
      : Promise.resolve([] as DbWorkOrderRow[]),
    // Count estimates and invoices + profitability snapshot + pipeline state (owner/admin only)
    session.role !== "tech"
      ? queryOneForSession<{
          estimate_count: string;
          invoice_count: string;
          change_order_count: string;
          parts_cost_cents: number | null;
          travel_miles: number | null;
          estimated_labor_cost_cents: number | null;
          tracked_labor_minutes: string | null;
          estimated_total_cents: number | null;
          invoice_total_cents: number | null;
          latest_invoice_id: string | null;
          has_sent_estimate: boolean;
          last_estimate_sent_at: string | null;
          has_approved_estimate: boolean;
          approved_estimate_id: string | null;
          latest_estimate_id: string | null;
          latest_estimate_number: string | null;
          latest_estimate_status: string | null;
          latest_estimate_total_cents: number | null;
          has_deposit_invoice: boolean;
          deposit_paid: boolean;
          deposit_invoice_id: string | null;
          deposit_invoice_status: string | null;
          deposit_invoice_total_cents: number | null;
          deposit_invoice_number: string | null;
          latest_final_status: string | null;
          latest_final_number: string | null;
          has_unpaid_invoice: boolean;
          has_paid_invoice: boolean;
          booking_request_id: string | null;
          booking_status: string | null;
          booking_pricing_mode: string | null;
          booking_service_description: string | null;
          expired_estimate_count: string;
          latest_expired_estimate_id: string | null;
          has_draft_work_order_with_pricing: boolean;
        }>(
          session,
          `SELECT
             (SELECT COUNT(*) FROM estimates WHERE job_id = $1 AND account_id = $2) AS estimate_count,
             (SELECT COUNT(*) FROM invoices  WHERE job_id = $1 AND account_id = $2) AS invoice_count,
             (SELECT COUNT(*) FROM change_orders co
              WHERE co.estimate_id = (
                SELECT id FROM estimates
                WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
                ORDER BY created_at DESC LIMIT 1
              )) AS change_order_count,
             j.actual_cost_cents AS parts_cost_cents,
             j.travel_miles,
             (SELECT internal_labor_cost_cents FROM estimates
              WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
              ORDER BY created_at DESC LIMIT 1) AS estimated_labor_cost_cents,
             (SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric
                FROM activity_entries ae
               WHERE ae.account_id = $2
                 AND ae.activity_type = 'job_work'
                 AND ae.voided_at IS NULL
                 AND ae.ended_at IS NOT NULL
                 AND (
                   (ae.entity_type = 'job' AND ae.entity_id = $1)
                   OR (ae.entity_type = 'visit' AND ae.entity_id IN (
                     SELECT v.id FROM visits v WHERE v.job_id = $1 AND v.account_id = $2
                   ))
                 )
             ) AS tracked_labor_minutes,
             (SELECT total_cents FROM estimates
              WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
              ORDER BY created_at DESC LIMIT 1) AS estimated_total_cents,
             (SELECT total_cents FROM invoices
              WHERE job_id = $1 AND account_id = $2 AND status != 'void'
              ORDER BY created_at DESC LIMIT 1) AS invoice_total_cents,
             (SELECT id FROM invoices
              WHERE job_id = $1 AND account_id = $2 AND status != 'void'
                AND invoice_kind IN ('final', 'standard')
              ORDER BY created_at DESC LIMIT 1) AS latest_invoice_id,
             EXISTS(SELECT 1 FROM estimates WHERE job_id = $1 AND account_id = $2 AND status IN ('sent','approved')) AS has_sent_estimate,
             (SELECT sent_at FROM estimates WHERE job_id = $1 AND account_id = $2 AND status IN ('sent','approved') ORDER BY created_at DESC LIMIT 1) AS last_estimate_sent_at,
             EXISTS(SELECT 1 FROM estimates WHERE job_id = $1 AND account_id = $2 AND status = 'approved') AS has_approved_estimate,
             (SELECT id FROM estimates WHERE job_id = $1 AND account_id = $2 AND status = 'approved' ORDER BY created_at DESC LIMIT 1) AS approved_estimate_id,
             (SELECT id FROM estimates WHERE job_id = $1 AND account_id = $2 ORDER BY created_at DESC LIMIT 1) AS latest_estimate_id,
             (SELECT estimate_number FROM estimates WHERE job_id = $1 AND account_id = $2 ORDER BY created_at DESC LIMIT 1) AS latest_estimate_number,
             (SELECT status FROM estimates WHERE job_id = $1 AND account_id = $2 ORDER BY created_at DESC LIMIT 1) AS latest_estimate_status,
             (SELECT total_cents FROM estimates WHERE job_id = $1 AND account_id = $2 ORDER BY created_at DESC LIMIT 1) AS latest_estimate_total_cents,
             EXISTS(SELECT 1 FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind = 'deposit') AS has_deposit_invoice,
             EXISTS(SELECT 1 FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind = 'deposit' AND status IN ('partial','paid')) AS deposit_paid,
             (SELECT id FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind = 'deposit' ORDER BY created_at DESC LIMIT 1) AS deposit_invoice_id,
             (SELECT status FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind = 'deposit' ORDER BY created_at DESC LIMIT 1) AS deposit_invoice_status,
             (SELECT total_cents FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind = 'deposit' ORDER BY created_at DESC LIMIT 1) AS deposit_invoice_total_cents,
             (SELECT invoice_number FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind = 'deposit' ORDER BY created_at DESC LIMIT 1) AS deposit_invoice_number,
             (SELECT status FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind IN ('final','standard') AND status != 'void' ORDER BY created_at DESC LIMIT 1) AS latest_final_status,
             (SELECT invoice_number FROM invoices WHERE job_id = $1 AND account_id = $2 AND invoice_kind IN ('final','standard') AND status != 'void' ORDER BY created_at DESC LIMIT 1) AS latest_final_number,
             -- Final/standard only: deposits must not drive pipeline "Invoiced"
             EXISTS(
               SELECT 1 FROM invoices
               WHERE job_id = $1 AND account_id = $2
                 AND invoice_kind IN ('final', 'standard')
                 AND status IN ('sent','partial','overdue')
             ) AS has_unpaid_invoice,
             EXISTS(
               SELECT 1 FROM invoices
               WHERE job_id = $1 AND account_id = $2
                 AND invoice_kind IN ('final', 'standard')
                 AND status = 'paid'
             ) AS has_paid_invoice,
             (SELECT id FROM booking_requests
              WHERE job_id = $1 AND account_id = $2
              ORDER BY created_at DESC LIMIT 1) AS booking_request_id,
             (SELECT status FROM booking_requests
              WHERE job_id = $1 AND account_id = $2
              ORDER BY created_at DESC LIMIT 1) AS booking_status,
             (SELECT pricing_mode FROM booking_requests
              WHERE job_id = $1 AND account_id = $2
              ORDER BY created_at DESC LIMIT 1) AS booking_pricing_mode,
             (SELECT service_description FROM booking_requests
              WHERE job_id = $1 AND account_id = $2
              ORDER BY created_at DESC LIMIT 1) AS booking_service_description,
             (SELECT COUNT(*) FROM estimates
              WHERE job_id = $1 AND account_id = $2 AND status = 'expired') AS expired_estimate_count,
             (SELECT id FROM estimates
              WHERE job_id = $1 AND account_id = $2 AND status = 'expired'
              ORDER BY created_at DESC LIMIT 1) AS latest_expired_estimate_id,
             EXISTS(
               SELECT 1 FROM work_orders
               WHERE job_id = $1 AND account_id = $2
                 AND status = 'draft' AND total_cents > 0
             ) AS has_draft_work_order_with_pricing
           FROM jobs j WHERE j.id = $1 AND j.account_id = $2`,
          [id, session.accountId]
        )
      : Promise.resolve(null),
    withAssetContext(session, (client) =>
      listAssetLinks(client, session.accountId, "job", id)
    ).catch(() => []),
    session.role !== "tech"
      ? withExpenseContext(session, (client) => fetchJobMaterialExpenses(client, session.accountId, id))
          .catch(() => [] as JobMaterialExpenseWithLines[])
      : Promise.resolve([] as JobMaterialExpenseWithLines[]),
    queryForSession<{
      work_date: string;
      started_at: string;
      ended_at: string;
      minutes: string;
      entry_count: number;
    }>(
      session,
      `SELECT
         ae.session_date::text AS work_date,
         MIN(ae.started_at) AS started_at,
         MAX(ae.ended_at) AS ended_at,
         COALESCE(SUM(EXTRACT(EPOCH FROM (ae.ended_at - ae.started_at)) / 60), 0)::numeric AS minutes,
         COUNT(*)::int AS entry_count
       FROM activity_entries ae
       WHERE ae.account_id = $2
         AND ae.activity_type = 'job_work'
         AND ae.voided_at IS NULL
         AND ae.started_at IS NOT NULL
         AND ae.ended_at IS NOT NULL
         AND (
           (ae.entity_type = 'job' AND ae.entity_id = $1)
           OR (
             ae.entity_type = 'visit'
             AND ae.entity_id IN (
               SELECT v.id FROM visits v
               WHERE v.job_id = $1 AND v.account_id = $2
             )
           )
           OR (
             ae.entity_type = 'work_order'
             AND ae.entity_id IN (
               SELECT wo.id FROM work_orders wo
               WHERE wo.job_id = $1 AND wo.account_id = $2
             )
           )
         )
       GROUP BY ae.session_date
       ORDER BY ae.session_date ASC`,
      [id, session.accountId],
    ).catch(() => []),
    queryForSession<{
      visit_id: string;
      task_id: string;
      label: string;
      completed: boolean;
      status: string;
    }>(
      session,
      `SELECT vt.visit_id, t.id AS task_id, t.label, t.completed, t.status
         FROM visit_tasks vt
         JOIN work_order_tasks t ON t.id = vt.task_id AND t.account_id = vt.account_id
         JOIN visits v ON v.id = vt.visit_id AND v.account_id = vt.account_id
        WHERE v.job_id = $1 AND vt.account_id = $2
        ORDER BY t.sort_order ASC, t.created_at ASC`,
      [id, session.accountId],
    ).catch(() => []),
  ]);

  const trackedLaborDays: TrackedLaborDay[] = mapTrackedLaborDayRows(trackedLaborDayRows ?? []);

  const currentStatus = job.status as JobStatus;
  const allowedTransitions = jobTransitions[currentStatus];
  const canTransition = canTransitionJob(session.role);
  const canAddVisit = canCreateVisit(session.role);
  const canDelete = canDeleteRecords(session.role);
  const canLinkExpenses = canManageExpenses(session.role);
  const canEstimate = canCreateEstimates(session.role);
  const isTech = session.role === "tech";

  const estimateCount = commercialCounts ? parseInt(commercialCounts.estimate_count) : 0;

  const latestFieldNotes =
    visits.find((v) => typeof v.tech_notes === "string" && v.tech_notes.trim())?.tech_notes ?? null;
  const tmBriefing = buildJobTmBriefing({
    title: job.title,
    description: job.description ?? null,
    intake_notes: job.intake_notes ?? null,
    property_address: job.property_address ?? null,
    property_city: job.property_city ?? null,
    property_state: job.property_state ?? null,
    field_notes: latestFieldNotes,
    request_description: commercialCounts?.booking_service_description ?? null,
    pricing_mode:
      (commercialCounts?.booking_pricing_mode as "flat_rate" | "hourly_internal" | null) ?? null,
  });
  // One-click T&M draft is only useful before any estimate exists on this project.
  // After draft/sent/approved, What Next + estimates list own the handoff.
  const showTmBriefingCard = !isTech && canEstimate && !!tmBriefing && estimateCount === 0;
  const invoiceCount = commercialCounts ? parseInt(commercialCounts.invoice_count) : 0;
  const changeOrderCount = commercialCounts ? parseInt(commercialCounts.change_order_count) : 0;
  const activeVisits = visits.filter((v) => !["completed", "cancelled"].includes(v.status));
  const executionVisits = visits.filter(isExecutionVisit);
  const preSaleSiteVisits = visits.filter(isPreSaleSiteVisit);
  const activeExecutionVisits = executionVisits.filter(
    (v) => !["completed", "cancelled"].includes(v.status)
  );
  const openPreSaleSiteVisits = preSaleSiteVisits.filter(
    (v) => !["completed", "cancelled"].includes(v.status)
  );
  const openPreSaleSiteVisit = openPreSaleSiteVisits[0] ?? null;
  const hasCompletedPreSaleSiteVisit = preSaleSiteVisits.some((v) => v.status === "completed");
  const completedSiteVisits = preSaleSiteVisits.filter((v) => v.status === "completed");
  const hasCompletedAssessmentVisit = completedSiteVisits.length > 0;
  const salesWalkthroughs = visits.filter((v) => v.visit_type === "sales_walkthrough");
  const hasSalesWalkthroughOnly =
    salesWalkthroughs.some((v) => v.status === "completed") &&
    preSaleSiteVisits.length === 0 &&
    !hasCompletedAssessmentVisit;
  const expiredEstimateCount = commercialCounts
    ? parseInt(commercialCounts.expired_estimate_count, 10)
    : 0;
  const latestVisit = visits[0] ?? null;

  const assessmentVisitId = pickAssessmentVisitId(visits);
  let assessmentFormIncomplete = false;
  let assessmentPacketDone: boolean | null = null;
  if (openPreSaleSiteVisit && session.role !== "tech") {
    const assessmentRow = await queryOneForSession<{ completed_at: string | null }>(
      session,
      `SELECT completed_at FROM site_visit_assessments
       WHERE visit_id = $1 AND account_id = $2`,
      [openPreSaleSiteVisit.id, session.accountId],
    );
    assessmentFormIncomplete = !assessmentRow?.completed_at;
    assessmentPacketDone = !!assessmentRow?.completed_at;
  } else if (openPreSaleSiteVisit) {
    assessmentFormIncomplete = true;
    assessmentPacketDone = false;
  } else if (assessmentVisitId && session.role !== "tech") {
    const assessmentRow = await queryOneForSession<{ completed_at: string | null }>(
      session,
      `SELECT completed_at FROM site_visit_assessments
       WHERE visit_id = $1 AND account_id = $2`,
      [assessmentVisitId, session.accountId],
    );
    assessmentPacketDone = assessmentRow ? !!assessmentRow.completed_at : null;
  }

  const workOrderBoard: WorkOrderBoardRow[] = workOrders.map((wo) => ({
    id: wo.id,
    title: wo.title,
    status: wo.status,
    visit_count: parseInt(wo.visit_count, 10) || 0,
    active_visit_count: parseInt(wo.active_visit_count, 10) || 0,
    task_total: parseInt(wo.task_total, 10) || 0,
    task_open: parseInt(wo.task_open, 10) || 0,
  }));
  const woMismatch = !isTech ? detectTaskScheduleMismatch(workOrderBoard) : null;
  const nextExecution = pickNextExecutionVisit(visits);
  const completedExecutionVisitCount = executionVisits.filter((v) => v.status === "completed").length;
  const openWorkOrderCount = workOrders.filter(
    (wo) => !["completed", "cancelled"].includes(String(wo.status))
  ).length;
  const readyForCloseout = isReadyForCloseout({
    jobStatus: currentStatus,
    executionActiveVisitCount: activeExecutionVisits.length,
    completedVisitCount: completedExecutionVisitCount,
    openWorkOrderCount,
    workOrderCount: workOrders.length,
  });
  const pipelineStage = derivePipelineStage({
    jobStatus: currentStatus,
    bookingStatus: commercialCounts?.booking_status ?? null,
    hasBookingRequest: !!commercialCounts?.booking_request_id,
    estimateCount,
    sentEstimateCount: commercialCounts?.has_sent_estimate ? 1 : 0,
    approvedEstimateCount: commercialCounts?.has_approved_estimate ? 1 : 0,
    executionActiveVisitCount: activeExecutionVisits.length,
    executionInProgressCount: executionVisits.filter((v) =>
      ["in_progress", "arrived", "dispatched", "traveling", "waiting"].includes(v.status)
    ).length,
    preSaleOpenSiteVisitCount: openPreSaleSiteVisits.length,
    completedPreSaleSiteVisit: preSaleSiteVisits.some((v) => v.status === "completed"),
    expiredEstimateCount,
    completedVisitCount: completedExecutionVisitCount,
    unpaidInvoiceCount: commercialCounts?.has_unpaid_invoice ? 1 : 0,
    paidInvoiceCount: commercialCounts?.has_paid_invoice ? 1 : 0,
    readyForCloseout,
    openWorkOrderCount,
  });

  // Profitability (owner/admin only)
  // Labor: prefer actual tracked job_work hours × burdened cost rate; fall back to
  // estimate internal labor. actual_cost_cents is the parts rollup; materials are receipts.
  const revenueCents = commercialCounts?.invoice_total_cents ?? commercialCounts?.estimated_total_cents ?? null;
  const partsCostCents = commercialCounts?.parts_cost_cents ?? 0;
  const materialsReceiptCostCents = jobMaterialExpenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const estimatedLaborCents = commercialCounts?.estimated_labor_cost_cents ?? null;
  const trackedMinutes = Number(commercialCounts?.tracked_labor_minutes ?? 0);
  const laborMargin = laborCostForMargin({
    trackedMinutes,
    estimatedLaborCostCents: estimatedLaborCents,
  });
  const laborCostCents = laborMargin.laborCostCents;
  const costCents =
    laborCostCents !== null || partsCostCents > 0 || materialsReceiptCostCents > 0
      ? (laborCostCents ?? 0) + partsCostCents + materialsReceiptCostCents
      : null;
  const grossMarginCents = revenueCents !== null && costCents !== null ? revenueCents - costCents : null;
  const grossMarginPct =
    grossMarginCents !== null && revenueCents !== null && revenueCents > 0
      ? Math.round((grossMarginCents / revenueCents) * 1000) / 10
      : null;

  const plannedByVisit = groupPlannedTasksByVisit(visitTaskRows ?? []);
  const allPlannedTaskIds = (visitTaskRows ?? []).map((r) => r.task_id);
  const openDeliverableTasks = taskProgress.tasks.filter(
    (t) => !t.completed && t.status !== "done",
  );
  const unplannedTasks = findUnplannedOpenTasks(
    openDeliverableTasks.map((t) => ({
      id: t.id,
      label: t.label,
      required: t.required,
      status: t.status,
      work_order_id: t.work_order_id,
      work_order_title: t.work_order_title,
    })),
    allPlannedTaskIds,
  );

  const planDays: VisitPlanDay[] = executionVisits
    .filter((v) => v.status !== "cancelled")
    .map((v) => {
      const day = new Date(v.scheduled_start).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
      const chips = plannedByVisit.get(v.id) ?? [];
      return {
        visitId: v.id,
        label: day,
        status: v.status,
        plannedTaskIds: chips.map((c) => c.id),
      };
    })
    // Prefer open days first in the plan picker, then reverse chrono for completed
    .sort((a, b) => {
      const aOpen = !["completed", "cancelled"].includes(a.status) ? 0 : 1;
      const bOpen = !["completed", "cancelled"].includes(b.status) ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return 0;
    });

  // Build timeline entries from visits — type label first (Assessment / Work Day)
  const timelineEntries: TimelineEntryData[] = visits.map((v) => {
    const overdue = isVisitOverdue(v);
    const typeLabel = visitTypeLabel(v.visit_type);
    const day = new Date(v.scheduled_start).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const dayTasks = plannedByVisit.get(v.id) ?? [];
    const techLine = v.assigned_user_name ? `Tech: ${v.assigned_user_name}` : "Unassigned";
    const taskSummary =
      dayTasks.length === 0
        ? isExecutionVisit(v)
          ? "No tasks planned"
          : null
        : `${dayTasks.filter((t) => t.completed).length}/${dayTasks.length} tasks`;

    return {
      id: v.id,
      timestamp: v.scheduled_start,
      title: `${typeLabel} · ${day} · ${formatVisitTime(v.scheduled_start)}`,
      subtitle: (
        <div data-testid={`visit-day-plan-${v.id}`}>
          <div>
            {techLine}
            {taskSummary ? ` · ${taskSummary}` : ""}
          </div>
          {dayTasks.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginTop: 6,
              }}
            >
              {dayTasks.map((t) => (
                <span
                  key={t.id}
                  title={t.label}
                  style={{
                    display: "inline-block",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    padding: "2px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: t.completed ? "var(--bg-muted, #f3f4f6)" : "var(--bg-card)",
                    color: t.completed ? "var(--fg-muted)" : "var(--fg)",
                    textDecoration: t.completed ? "line-through" : undefined,
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {truncateTaskChipLabel(t.label)}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ),
      status: v.status,
      badge: overdue ? (
        <span className="p7-badge p7-badge-status-overdue" style={{ fontSize: "var(--text-xs)" }}>
          Overdue
        </span>
      ) : undefined,
      href: `/app/visits/${v.id}`,
      isCompleted: v.status === "completed" || v.status === "cancelled",
    };
  });

  const addDayHref = buildAddDayHref(
    job.id,
    visits.map((v) => ({
      scheduled_start: v.scheduled_start,
      scheduled_end: v.scheduled_end,
      assigned_user_id: v.assigned_user_id,
      work_order_id: v.work_order_id ?? null,
      visit_type: v.visit_type,
      status: v.status,
    })),
  ) as Route;

  const scheduleVisitAction = canAddVisit ? (
    <span style={{ display: "inline-flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <LinkButton
        href={addDayHref}
        variant="primary"
        size="sm"
        data-testid="add-visit-btn"
      >
        + Add a day
      </LinkButton>
      <LinkButton
        href={`/app/jobs/${job.id}/visits/new?visit_type=site_visit&intent=assessment`}
        variant="secondary"
        size="sm"
        data-testid="add-assessment-btn"
      >
        + Assessment
      </LinkButton>
      <LinkButton
        href={`/app/jobs/${job.id}/visits/new?multi=1&visit_type=standard&intent=book_work`}
        variant="secondary"
        size="sm"
        data-testid="add-multi-day-btn"
      >
        Multiple days
      </LinkButton>
    </span>
  ) : undefined;

  // Phone layout — rendered alongside the desktop layout and toggled by
  // viewport width (p7-only-* utilities), replacing the workspace-mode cookie.
  const currentVisit = activeVisits.find((v) => v.status === "in_progress" || v.status === "arrived") ?? activeVisits[0] ?? visits[0] ?? null;
  const visitHref = currentVisit ? (`/app/visits/${currentVisit.id}` as Route) : null;
  // Universal maps link: opens the native maps app on both iOS and Android
  // (and the browser as fallback). maps.apple.com only deep-links cleanly on iOS.
  const mapHref = job.property_address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.property_address)}` : null;

  const mobileView = (
      <div style={{ padding: "var(--space-4) var(--space-4) var(--space-12)", display: "flex", flexDirection: "column", gap: "var(--space-5)", maxWidth: 760 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <Link href="/app/jobs" style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", textDecoration: "none", fontWeight: 700 }}>
            Projects
          </Link>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800 }}>{job.title}</h1>
              <p style={{ margin: "var(--space-1) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                {job.job_number ? `${job.job_number} · ` : ""}{job.client_name ?? "Current job"}{job.property_address ? ` / ${job.property_address}` : ""}
              </p>
            </div>
            <StatusBadge variant={currentStatus as StatusVariant}>{JOB_STATUS_LABELS[currentStatus]}</StatusBadge>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--space-2)" }}>
          {job.client_phone ? <MobileJobExternalAction href={`tel:${job.client_phone}`} label="Call" /> : null}
          {job.client_phone ? <MobileJobExternalAction href={`sms:${job.client_phone}`} label="Text" /> : null}
          {mapHref ? <MobileJobExternalAction href={mapHref} label="Map" /> : null}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 800 }}>Current Job</h2>
          <div style={{ padding: "var(--space-4)", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", color: job.description ? "var(--fg)" : "var(--fg-muted)" }}>
            {job.description || "No scope notes have been added yet."}
          </div>
          {showTmBriefingCard ? (
            <UseTmBriefingButton
              jobId={job.id}
              clientId={job.client_id ?? null}
              briefing={tmBriefing}
              variant="primary"
              label="Use this briefing (T&M) →"
            />
          ) : null}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {visitHref ? (
            <>
              <MobileJobAction href={visitHref} label="Scope" detail="Open the active visit scope and checklist" primary />
              <MobileJobAction href={`${visitHref}#visit-issue` as Route} label="Photos" detail="Capture before, assessment, and completion photos" />
              <MobileJobAction href={`${visitHref}#visit-parts` as Route} label="Materials" detail="Record parts and materials used" />
              <MobileJobAction href={`${visitHref}#visit-resolution` as Route} label="Notes" detail="Document the work performed" />
              <MobileJobAction href={`${visitHref}#visit-completion` as Route} label="Complete Visit" detail="Finish photos, signature, and closeout" primary />
            </>
          ) : (
            <div style={{ padding: "var(--space-4)", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-card)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
              No visit is scheduled for this job yet.
            </div>
          )}
          {canAddVisit ? (
            <Link
              href={addDayHref}
              className="p7-btn p7-btn-primary p7-btn-sm"
              style={{ justifyContent: "center" }}
              data-testid="add-visit-btn-mobile"
            >
              {visits.length > 0 ? "Add a day to schedule" : "Schedule a day"}
            </Link>
          ) : null}
        </section>

        <AdvancedDetails title="Secondary Details">
          <dl className="p7-detail-list">
            {job.client_name && <div className="p7-detail-row"><dt>Client</dt><dd>{job.client_name}</dd></div>}
            {job.property_address && <div className="p7-detail-row"><dt>Property</dt><dd>{job.property_address}</dd></div>}
            <div className="p7-detail-row"><dt>Status</dt><dd>{JOB_STATUS_LABELS[currentStatus]}</dd></div>
            <div className="p7-detail-row"><dt>Visits</dt><dd>{visits.length}</dd></div>
            {!isTech && assessmentVisitId ? (
              <div className="p7-detail-row">
                <dt>Assessment</dt>
                <dd>
                  <Link
                    href={`/app/visits/${assessmentVisitId}/assessment` as Route}
                    style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                  >
                    Open assessment →
                  </Link>
                </dd>
              </div>
            ) : null}
            {!isTech && commercialCounts?.latest_estimate_id ? (
              <div className="p7-detail-row">
                <dt>Estimate</dt>
                <dd>
                  <Link
                    href={`/app/estimates/${commercialCounts.latest_estimate_id}` as Route}
                    style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                  >
                    {commercialCounts.latest_estimate_number ?? "Estimate"} →
                  </Link>
                </dd>
              </div>
            ) : !isTech ? (
              <div className="p7-detail-row"><dt>Estimates</dt><dd>{estimateCount}</dd></div>
            ) : null}
            {!isTech && commercialCounts?.latest_invoice_id ? (
              <div className="p7-detail-row">
                <dt>Invoice</dt>
                <dd>
                  <Link
                    href={`/app/invoices/${commercialCounts.latest_invoice_id}` as Route}
                    style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                  >
                    Open invoice →
                  </Link>
                </dd>
              </div>
            ) : !isTech ? (
              <div className="p7-detail-row"><dt>Invoices</dt><dd>{invoiceCount}</dd></div>
            ) : null}
            {!isTech && taskProgress.total > 0 ? (
              <div className="p7-detail-row">
                <dt>Tasks</dt>
                <dd>
                  {taskProgress.done}/{taskProgress.total} done ({taskProgress.percent}%)
                </dd>
              </div>
            ) : null}
            {!isTech && nextExecution ? (
              <div className="p7-detail-row">
                <dt>Field day</dt>
                <dd>
                  <Link
                    href={`/app/visits/${nextExecution.id}` as Route}
                    style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                  >
                    {nextExecution.label} →
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </AdvancedDetails>

        <LinkedDocuments session={session} entityType="job" entityId={job.id} />
      </div>
  );

  const desktopView = (
    <PageContainer>
      <PageHeader
        title={job.title}
        subtitle={
          [
            job.job_number,
            job.client_name,
            job.property_address && job.property_address !== "TBD" ? job.property_address : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        backHref="/app/jobs"
        backLabel="Projects"
        actions={
          <span data-testid="job-status" style={{ display: "inline-flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center" }}>
            {job.client_phone ? (
              <a
                href={`tel:${job.client_phone}`}
                className="p7-btn p7-btn-secondary p7-btn-sm"
                style={{ textDecoration: "none" }}
              >
                Call
              </a>
            ) : null}
            {job.client_id ? (
              <LinkButton href={`/app/clients/${job.client_id}`} variant="secondary" size="sm">
                Customer
              </LinkButton>
            ) : null}
            <StatusBadge variant={currentStatus as StatusVariant}>
              {JOB_STATUS_LABELS[currentStatus]}
            </StatusBadge>
            {job.sub_status && (
              <StatusBadge variant="overdue">
                {SUB_STATUS_LABELS[job.sub_status] ?? job.sub_status}
              </StatusBadge>
            )}
          </span>
        }
      />

      {!isTech && commercialCounts && (
        <ProjectWhatNext
          jobId={job.id}
          clientId={job.client_id ?? null}
          jobStatus={currentStatus}
          stage={pipelineStage}
          pricingMode={commercialCounts.booking_pricing_mode as "flat_rate" | "hourly_internal" | null}
          bookingRequestId={commercialCounts.booking_request_id}
          estimateCount={estimateCount}
          hasSentEstimate={commercialCounts.has_sent_estimate}
          lastEstimateSentAt={commercialCounts.last_estimate_sent_at}
          hasApprovedEstimate={commercialCounts.has_approved_estimate}
          approvedEstimateId={commercialCounts.approved_estimate_id}
          hasDepositInvoice={commercialCounts.has_deposit_invoice}
          depositPaid={commercialCounts.deposit_paid}
          hasActiveVisit={activeExecutionVisits.length > 0}
          activeVisitId={activeExecutionVisits[0]?.id ?? null}
          latestVisitId={latestVisit?.id ?? null}
          readyForCloseout={readyForCloseout}
          hasCompletedExecutionVisit={completedExecutionVisitCount > 0}
          hasOpenWorkOrder={openWorkOrderCount > 0}
          hasUnpaidInvoice={commercialCounts.has_unpaid_invoice}
          hasPaidInvoice={commercialCounts.has_paid_invoice}
          latestInvoiceId={commercialCounts.latest_invoice_id}
          hasOpenPreSaleSiteVisit={openPreSaleSiteVisits.length > 0}
          hasCompletedPreSaleSiteVisit={hasCompletedPreSaleSiteVisit}
          hasExpiredEstimate={expiredEstimateCount > 0}
          latestExpiredEstimateId={commercialCounts.latest_expired_estimate_id}
          hasDraftWorkOrderWithPricing={commercialCounts.has_draft_work_order_with_pricing}
          preSaleSiteVisitId={openPreSaleSiteVisit?.id ?? null}
          assessmentFormIncomplete={assessmentFormIncomplete}
          hasCompletedAssessmentVisit={hasCompletedAssessmentVisit}
          hasSalesWalkthroughOnly={hasSalesWalkthroughOnly}
        />
      )}

      {/* The control-panel board: every project artifact indexed exactly once */}
      {!isTech && commercialCounts && (
        <ProjectOverview
          jobId={job.id}
          mismatch={woMismatch}
          estimate={
            commercialCounts.latest_estimate_id
              ? {
                  id: commercialCounts.latest_estimate_id,
                  number: commercialCounts.latest_estimate_number,
                  status: commercialCounts.latest_estimate_status,
                  totalCents: commercialCounts.latest_estimate_total_cents,
                }
              : null
          }
          approvedEstimateId={commercialCounts.approved_estimate_id}
          deposit={
            commercialCounts.deposit_invoice_id
              ? {
                  id: commercialCounts.deposit_invoice_id,
                  number: commercialCounts.deposit_invoice_number,
                  status: commercialCounts.deposit_invoice_status,
                  paid: commercialCounts.deposit_paid,
                  totalCents: commercialCounts.deposit_invoice_total_cents,
                }
              : null
          }
          hasApprovedEstimate={commercialCounts.has_approved_estimate}
          invoice={
            commercialCounts.latest_invoice_id
              ? {
                  id: commercialCounts.latest_invoice_id,
                  number: commercialCounts.latest_final_number,
                  status: commercialCounts.latest_final_status,
                  totalCents: commercialCounts.invoice_total_cents,
                }
              : null
          }
          assessment={
            assessmentVisitId ? { visitId: assessmentVisitId, done: assessmentPacketDone } : null
          }
          workDayCount={executionVisits.length}
          nextDay={
            nextExecution ? { visitId: nextExecution.id, label: nextExecution.label } : null
          }
          tasks={{
            total: taskProgress.total,
            done: taskProgress.done,
            percent: taskProgress.percent,
            unplanned: unplannedTasks.length,
          }}
          workOrderCount={workOrderBoard.length}
        />
      )}

      {job.description ? (
        <Card style={{ marginBottom: "var(--space-4)" }} data-testid="project-scope">
          <SectionHeader title="Scope" />
          <p style={{ margin: 0, fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {job.description}
          </p>
        </Card>
      ) : null}

      {showTmBriefingCard && (
        <Card
          data-testid="job-tm-briefing-card"
          style={{ marginBottom: "var(--space-4)" }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-3)",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "var(--text-xs)",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                }}
              >
                T&amp;M estimate
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "var(--text-sm)", color: "var(--fg)" }}>
                No estimate yet — one click builds a time-and-materials draft from this project’s notes.
              </p>
            </div>
            <UseTmBriefingButton
              jobId={job.id}
              clientId={job.client_id ?? null}
              briefing={tmBriefing}
              variant="primary"
              size="sm"
              label="Use this briefing →"
            />
          </div>
        </Card>
      )}

      {/* Detail Hub Layout: two-column on desktop, stacked on mobile */}
      <div className="p7-detail-layout">
        {/* LEFT: Field work first */}
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader
              title="Field schedule"
              count={visits.length}
              action={scheduleVisitAction}
            />
            {visits.length === 0 ? (
              <EmptyState
                title="Nothing on the calendar"
                description={
                  canAddVisit
                    ? "Add a work day to put this project on the schedule, or book an Assessment for scope capture."
                    : "No visits have been scheduled for this project."
                }
                data-testid="visits-empty"
              />
            ) : (
              <>
                <Timeline entries={timelineEntries} />
                {canAddVisit ? (
                  <div
                    style={{
                      marginTop: "var(--space-3)",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "var(--space-2)",
                      alignItems: "center",
                    }}
                  >
                    <LinkButton
                      href={addDayHref}
                      variant="primary"
                      size="sm"
                      data-testid="add-day-below-timeline"
                    >
                      + Add a day to the schedule
                    </LinkButton>
                    <span className="muted" style={{ fontSize: "var(--text-xs)" }}>
                      Prefills next day from the last work day
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </Card>

          {taskProgress.total > 0 || !isTech ? (
            <Card id="job-tasks" data-testid="job-tasks-card">
              <SectionHeader
                title="Tasks & progress"
                count={taskProgress.total > 0 ? taskProgress.total : undefined}
              />
              <JobTasksPanel
                jobId={job.id}
                progress={taskProgress}
                tasks={taskProgress.tasks}
                canToggle={session.role === "owner" || session.role === "admin"}
              />
            </Card>
          ) : null}

          {/* Log a day: narrate what got done, AI attributes per-task time to that date */}
          {!isTech && taskProgress.total > 0 ? <DailyRecapPanel jobId={job.id} /> : null}

          {!isTech && (taskProgress.total > 0 || unplannedTasks.length > 0) ? (
            <Card id="job-unplanned" data-testid="job-unplanned-card">
              <SectionHeader
                title="Unplanned work"
                count={unplannedTasks.length > 0 ? unplannedTasks.length : undefined}
              />
              <ProjectUnplannedTasks
                tasks={unplannedTasks}
                planDays={planDays}
                canPlan={
                  canAddVisit ||
                  session.role === "owner" ||
                  session.role === "admin" ||
                  session.role === "tech"
                }
              />
            </Card>
          ) : null}

          {!isTech && workOrders.length > 0 && (
            <Card id="job-work-orders" data-testid="job-work-orders-panel">
              <SectionHeader title="Work Orders" count={workOrders.length} />
              <JobWorkOrdersPanel
                jobId={job.id}
                workOrders={workOrderBoard.map((wo): JobWorkOrderRow => ({
                  id: wo.id,
                  title: wo.title,
                  status: wo.status,
                  visit_count: wo.visit_count,
                  active_visit_count: wo.active_visit_count,
                  task_total: wo.task_total,
                  task_open: wo.task_open,
                }))}
                canManage={canAddVisit}
              />
            </Card>
          )}

          {/* Materials: linked receipts + collapsed "link unassigned" (not a second card) */}
          {!isTech && (jobMaterialExpenses.length > 0 || canLinkExpenses) && (
            <Card data-testid="job-materials-panel">
              <SectionHeader
                title="Materials"
                count={jobMaterialExpenses.length > 0 ? jobMaterialExpenses.length : undefined}
              />
              <JobMaterialsPanel expenses={jobMaterialExpenses} />
              {canLinkExpenses && (
                <LinkForgottenExpensesPanel mode="job" jobId={job.id} />
              )}
            </Card>
          )}

          {/* Status Transitions — admin/owner only (explicit project completion) */}
          {canTransition && allowedTransitions.length > 0 && (
            <Card id="project-status" data-testid="job-transition-panel">
              <SectionHeader title="Close Out Project" />
              <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                Visits and work orders never close this project. When field work is done, mark the
                project complete here to create a draft final invoice for billing review.
              </p>
              <JobTransitionForm
                jobId={job.id}
                allowedTransitions={allowedTransitions as JobStatus[]}
                statusLabels={JOB_STATUS_LABELS}
              />
            </Card>
          )}

          {/* Danger Zone — owner only, draft only */}
          {canDelete && currentStatus === "draft" && (
            <AdvancedDetails title="Danger Zone">
              <Card className="p7-card-danger" data-testid="danger-zone">
                <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
                  Delete this job permanently. Only available for draft jobs.
                </p>
                <DeleteJobButton jobId={job.id} />
              </Card>
            </AdvancedDetails>
          )}
        </div>

        {/* RIGHT: Job details + Commercial panel */}
        {!isTech && (
          <div className="p7-detail-sidebar">
            {/* Who / where — glanceable */}
            <Card data-testid="project-who-where">
              <SectionHeader title="Customer & site" />
              <dl className="p7-detail-list">
                {job.client_id && (
                  <div className="p7-detail-row">
                    <dt>Customer</dt>
                    <dd>
                      <Link
                        href={`/app/clients/${job.client_id}`}
                        style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                      >
                        {job.client_name ?? "Customer"} →
                      </Link>
                      {job.client_phone ? (
                        <div style={{ marginTop: 4 }}>
                          <a href={`tel:${job.client_phone}`} style={{ color: "var(--fg)", fontSize: "var(--text-sm)" }}>
                            {job.client_phone}
                          </a>
                        </div>
                      ) : null}
                    </dd>
                  </div>
                )}
                {job.property_id && (
                  <div className="p7-detail-row">
                    <dt>Property</dt>
                    <dd>
                      <Link
                        href={`/app/properties/${job.property_id}`}
                        style={{ color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-sm)", fontWeight: 600 }}
                      >
                        {job.property_address ?? "View property"} →
                      </Link>
                    </dd>
                  </div>
                )}
                <div className="p7-detail-row">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge variant={currentStatus as StatusVariant}>
                      {JOB_STATUS_LABELS[currentStatus]}
                    </StatusBadge>
                    {job.sub_status && (
                      <span style={{ marginLeft: "var(--space-2)" }}>
                        <StatusBadge variant="overdue">
                          {SUB_STATUS_LABELS[job.sub_status] ?? job.sub_status}
                        </StatusBadge>
                      </span>
                    )}
                  </dd>
                </div>
                <div className="p7-detail-row">
                  <dt>On hold / exception</dt>
                  <dd>
                    <SubStatusSelect
                      endpoint={`/api/v1/jobs/${job.id}/sub-status`}
                      initialValue={job.sub_status}
                      options={JOB_SUB_STATUSES.map((value) => ({
                        value,
                        label: SUB_STATUS_LABELS[value],
                      }))}
                    />
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Edit form — admin/owner only */}
            <AdvancedDetails title="Edit Project Details">
              <JobEditForm
                jobId={job.id}
                initialTitle={job.title}
                initialClientId={job.client_id ?? null}
                initialPropertyId={job.property_id ?? null}
                initialDescription={job.description ?? null}
                initialPriority={job.priority ?? 0}
                initialActualCostCents={job.actual_cost_cents ?? null}
                initialTravelMiles={job.travel_miles ?? null}
              />
            </AdvancedDetails>

            {/* Intake panel — admin/owner only */}
            <AdvancedDetails title="Intake Scoring">
              <Card data-testid="job-intake-card">
                <JobIntakePanel
                  jobId={job.id}
                  initialCategory={job.job_category}
                  initialDecision={job.intake_decision}
                  initialNotes={job.intake_notes ?? null}
                />
              </Card>
            </AdvancedDetails>

            {/* Vendor coordination */}
            {(
              <VendorCoordinationCard
                jobId={job.id}
                vendorCoordination={job.vendor_coordination}
                conciergeFeeCents={job.concierge_fee_cents}
                canEdit={canTransition}
              />
            )}

            {/* Commercial links — estimates, invoices, materials plan, change orders */}
            <Card>
              <SectionHeader
                title="Commercial"
                action={
                  commercialCounts?.booking_pricing_mode === "hourly_internal" ? (
                    <LinkButton
                      href={`/app/invoices/new?job_id=${job.id}${job.client_id ? `&client_id=${job.client_id}` : ""}`}
                      variant="secondary"
                      size="sm"
                      data-testid="new-invoice-btn"
                    >
                      + Invoice Draft
                    </LinkButton>
                  ) : (
                    <LinkButton
                      href={`/app/estimates/new?job_id=${job.id}&client_id=${job.client_id ?? ""}&pricing_mode=flat_rate`}
                      variant="secondary"
                      size="sm"
                      data-testid="new-estimate-btn"
                    >
                      + New Estimate
                    </LinkButton>
                  )
                }
              />
              <dl className="p7-detail-list">
                <div className="p7-detail-row">
                  <dt>Estimates</dt>
                  <dd>
                    {estimateCount > 0 ? (
                      <Link
                        href={`/app/estimates?job_id=${job.id}`}
                        style={{ color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-sm)" }}
                      >
                        {estimateCount} estimate{estimateCount !== 1 ? "s" : ""} →
                      </Link>
                    ) : (
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>None</span>
                    )}
                  </dd>
                </div>
                <div className="p7-detail-row">
                  <dt>Invoices</dt>
                  <dd>
                    {invoiceCount > 0 ? (
                      <Link
                        href={`/app/invoices?job_id=${job.id}`}
                        style={{ color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-sm)" }}
                      >
                        {invoiceCount} invoice{invoiceCount !== 1 ? "s" : ""} →
                      </Link>
                    ) : (
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>None</span>
                    )}
                  </dd>
                </div>
                {commercialCounts?.approved_estimate_id && (
                  <>
                    <div className="p7-detail-row">
                      <dt>Materials</dt>
                      <dd>
                        <Link
                          href={`/app/estimates/${commercialCounts.approved_estimate_id}/shopping-list`}
                          style={{ color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-sm)" }}
                        >
                          Approved materials plan →
                        </Link>
                      </dd>
                    </div>
                    <div className="p7-detail-row">
                      <dt>Change orders</dt>
                      <dd>
                        {changeOrderCount > 0 ? (
                          <Link
                            href={`/app/estimates/${commercialCounts.approved_estimate_id}#change-orders`}
                            style={{ color: "var(--accent)", textDecoration: "none", fontSize: "var(--text-sm)" }}
                          >
                            {changeOrderCount} change order{changeOrderCount !== 1 ? "s" : ""} →
                          </Link>
                        ) : (
                          <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                            No change orders yet
                          </span>
                        )}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </Card>

            {/* Tracked work days — transparent day-by-day job_work record */}
            {trackedLaborDays.length > 0 && (
              <Card data-testid="tracked-work-days-card">
                <SectionHeader title="Tracked work days" />
                <p
                  style={{
                    margin: "0 0 var(--space-3)",
                    color: "var(--fg-muted)",
                    fontSize: "var(--text-sm)",
                    lineHeight: 1.45,
                  }}
                >
                  Closed job_work from the activity log (used for margin). Invoice labor may
                  differ if you bill estimated or adjusted hours.
                </p>
                <div
                  role="table"
                  aria-label="Tracked work days"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "2px 0",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  <div
                    role="row"
                    style={{
                      display: "contents",
                      fontWeight: 600,
                      color: "var(--fg-muted)",
                      fontSize: "var(--text-xs)",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                    }}
                  >
                    <div role="columnheader" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      Day
                    </div>
                    <div
                      role="columnheader"
                      style={{
                        padding: "6px 0",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "right",
                      }}
                    >
                      Hours
                    </div>
                  </div>
                  {trackedLaborDays.map((day) => (
                    <div
                      key={day.work_date}
                      role="row"
                      data-testid={`tracked-work-day-${day.work_date}`}
                      style={{ display: "contents" }}
                    >
                      <div
                        role="cell"
                        style={{
                          padding: "10px 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{formatWorkDayLabel(day.work_date)}</div>
                        <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
                          {formatClockRange(day.started_at, day.ended_at)}
                          {day.entry_count > 1 ? ` · ${day.entry_count} segments` : ""}
                        </div>
                      </div>
                      <div
                        role="cell"
                        style={{
                          padding: "10px 0",
                          borderBottom: "1px solid var(--border)",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          alignSelf: "center",
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{day.hours.toFixed(2)} hrs</div>
                        <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                          {formatMinutesAsHoursMinutes(day.minutes)}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div
                    role="row"
                    data-testid="tracked-work-days-total"
                    style={{ display: "contents", fontWeight: 600 }}
                  >
                    <div role="cell" style={{ padding: "12px 0 4px" }}>
                      Total tracked
                      <div style={{ fontWeight: 400, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                        {trackedLaborDays.length} day{trackedLaborDays.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div
                      role="cell"
                      style={{
                        padding: "12px 0 4px",
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                        alignSelf: "center",
                      }}
                    >
                      {laborMargin.trackedHours.toFixed(2)} hrs
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Profitability — tracked hours feed margin on every job (flat + T&M) */}
            {!isTech && (revenueCents !== null || costCents !== null || trackedMinutes > 0) && (
              <Card data-testid="profitability-card">
                <SectionHeader title="Profitability" />
                <dl className="p7-detail-list">
                  {revenueCents !== null && (
                    <div className="p7-detail-row">
                      <dt>Revenue</dt>
                      <dd>${(revenueCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {trackedMinutes > 0 && (
                    <div className="p7-detail-row" data-testid="tracked-hours">
                      <dt>Tracked Hours</dt>
                      <dd>
                        {laborMargin.trackedHours.toFixed(2)} hrs
                        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginLeft: 6 }}>
                          ({trackedLaborDays.length || "—"} day
                          {trackedLaborDays.length === 1 ? "" : "s"} · job_work)
                        </span>
                      </dd>
                    </div>
                  )}
                  {laborMargin.actualLaborCostCents !== null && (
                    <div className="p7-detail-row" data-testid="actual-labor-cost">
                      <dt>Actual Labor Cost</dt>
                      <dd>{formatCents(laborMargin.actualLaborCostCents)}</dd>
                    </div>
                  )}
                  {estimatedLaborCents !== null && (
                    <div className="p7-detail-row">
                      <dt>Est. Labor Cost</dt>
                      <dd>
                        {formatCents(estimatedLaborCents)}
                        {laborMargin.source === "tracked" && laborMargin.actualLaborCostCents !== null && (
                          <span
                            style={{
                              color: "var(--fg-muted)",
                              fontSize: "var(--text-xs)",
                              marginLeft: 6,
                            }}
                            data-testid="labor-variance"
                          >
                            {laborMargin.actualLaborCostCents - estimatedLaborCents >= 0 ? "+" : ""}
                            {formatCents(laborMargin.actualLaborCostCents - estimatedLaborCents)} vs est
                          </span>
                        )}
                      </dd>
                    </div>
                  )}
                  {partsCostCents > 0 && (
                    <div className="p7-detail-row">
                      <dt>Parts Cost</dt>
                      <dd>${(partsCostCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {materialsReceiptCostCents > 0 && (
                    <div className="p7-detail-row">
                      <dt>Materials (receipts)</dt>
                      <dd>${(materialsReceiptCostCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {costCents !== null && (
                      <div className="p7-detail-row" style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-1)" }}>
                        <dt>Total Cost</dt>
                        <dd>
                          {formatCents(costCents)}
                          {laborMargin.source === "tracked" && (
                            <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginLeft: 6 }}>
                              uses actual labor
                            </span>
                          )}
                        </dd>
                      </div>
                    )}
                  {grossMarginCents !== null && (
                    <div className="p7-detail-row">
                      <dt>Gross Margin</dt>
                      <dd
                        style={{ color: grossMarginCents >= 0 ? "var(--color-success, green)" : "var(--color-error, red)", fontWeight: 600 }}
                        data-testid="gross-margin"
                      >
                        ${(grossMarginCents / 100).toFixed(2)}
                        {grossMarginPct !== null && ` (${grossMarginPct}%)`}
                      </dd>
                    </div>
                  )}
                  {commercialCounts?.travel_miles !== null && commercialCounts?.travel_miles !== undefined && (
                    <div className="p7-detail-row">
                      <dt>Travel Miles</dt>
                      <dd>{commercialCounts.travel_miles} mi</dd>
                    </div>
                  )}
                  {laborMargin.source === "none" && !partsCostCents && !materialsReceiptCostCents && (
                    <div className="p7-detail-row">
                      <dt></dt>
                      <dd style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                        No tracked time, approved estimate, or parts logged yet
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>
            )}


            {/* Asset links (Homebox) */}
            {(
              <AdvancedDetails title="Home Assets">
                <AssetLinksPanel
                  entityType="job"
                  entityId={job.id}
                  initialLinks={assetLinks}
                  homeboxEnabled={homeboxEnabled}
                  canLink={!isTech}
                />
              </AdvancedDetails>
            )}

            <LinkedDocuments session={session} entityType="job" entityId={job.id} />
          </div>
        )}

        {/* Tech view: show job info inline below timeline */}
        {isTech && (
          <div className="p7-detail-sidebar">
            <Card>
              <SectionHeader title="Project Details" />
              <dl className="p7-detail-list">
                {job.client_name && (
                  <div className="p7-detail-row">
                    <dt>Client</dt>
                    <dd>{job.client_name}</dd>
                  </div>
                )}
                {job.description && (
                  <div className="p7-detail-row">
                    <dt>Description</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>{job.description}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </div>
        )}
      </div>
    </PageContainer>
  );

  return (
    <>
      <div className="p7-only-mobile">{mobileView}</div>
      <div className="p7-only-desktop">{desktopView}</div>
    </>
  );
}
