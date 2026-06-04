import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllJobs } from "@/lib/auth/permissions";
import { PageContainer, PageHeader } from "@/components/ui";
import { JobBoard } from "@/app/app/jobs/JobBoard";
import {
  derivePipelineStage,
  getPipelineNextAction,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_ORDER,
} from "@ai-fsm/domain";
import { NewLeadButton } from "../pipeline/NewLeadButton";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  title: string;
  status: string;
  priority: number;
  client_name: string | null;
  next_visit_start: string | null;
  has_approved_estimate: boolean;
  has_active_visit: boolean;
  sub_status: string | null;
  booking_status: string | null;
  has_booking_request: boolean;
  estimate_count: number;
  sent_estimate_count: number;
  approved_estimate_count: number;
  active_visit_count: number;
  in_progress_visit_count: number;
  completed_visit_count: number;
  unpaid_invoice_count: number;
  paid_invoice_count: number;
  estimate_condition_tier: string | null;
};

export default async function WorkflowPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllJobs(session.role);
  if (!isAdmin) redirect("/app/my-day");

  const rows = await query<JobRow>(
    `SELECT j.id, j.title, j.status, j.priority, j.sub_status,
            c.name AS client_name,
            br.status AS booking_status,
            (br.id IS NOT NULL) AS has_booking_request,
            (SELECT v.scheduled_start::text
               FROM visits v
               WHERE v.job_id = j.id AND v.account_id = j.account_id
                 AND v.status NOT IN ('cancelled','completed')
               ORDER BY v.scheduled_start ASC LIMIT 1
            ) AS next_visit_start,
            (SELECT COUNT(*)::int FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id) AS estimate_count,
            (SELECT COUNT(*)::int FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id AND e.status IN ('sent','approved')) AS sent_estimate_count,
            (SELECT COUNT(*)::int FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved') AS approved_estimate_count,
            (SELECT COUNT(*)::int FROM visits va
              WHERE va.job_id = j.id AND va.account_id = j.account_id
                AND va.status NOT IN ('cancelled','completed')) AS active_visit_count,
            (SELECT COUNT(*)::int FROM visits vi
              WHERE vi.job_id = j.id AND vi.account_id = j.account_id AND vi.status = 'in_progress') AS in_progress_visit_count,
            (SELECT COUNT(*)::int FROM visits vc
              WHERE vc.job_id = j.id AND vc.account_id = j.account_id AND vc.status = 'completed') AS completed_visit_count,
            (SELECT COUNT(*)::int FROM invoices iu
              WHERE iu.job_id = j.id AND iu.account_id = j.account_id AND iu.status IN ('sent','partial','overdue')) AS unpaid_invoice_count,
            (SELECT COUNT(*)::int FROM invoices ip
              WHERE ip.job_id = j.id AND ip.account_id = j.account_id AND ip.status = 'paid') AS paid_invoice_count,
            (SELECT condition_tier FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id
                AND e.status IN ('draft','sent','approved')
              ORDER BY CASE condition_tier WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END,
                       e.created_at DESC
              LIMIT 1) AS estimate_condition_tier
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     LEFT JOIN LATERAL (
       SELECT id, status
       FROM booking_requests br
       WHERE br.job_id = j.id AND br.account_id = j.account_id
       ORDER BY br.created_at DESC
       LIMIT 1
     ) br ON true
     WHERE j.account_id = $1 AND j.status != 'cancelled'
     ORDER BY j.priority DESC, j.created_at DESC
     LIMIT 200`,
    [session.accountId]
  );
  const jobs = rows.map((job) => {
    const pipelineStage = derivePipelineStage({
      jobStatus: job.status,
      subStatus: job.sub_status,
      bookingStatus: job.booking_status,
      hasBookingRequest: job.has_booking_request,
      estimateCount: job.estimate_count,
      sentEstimateCount: job.sent_estimate_count,
      approvedEstimateCount: job.approved_estimate_count,
      activeVisitCount: job.active_visit_count,
      inProgressVisitCount: job.in_progress_visit_count,
      completedVisitCount: job.completed_visit_count,
      unpaidInvoiceCount: job.unpaid_invoice_count,
      paidInvoiceCount: job.paid_invoice_count,
    });

    return {
      ...job,
      has_approved_estimate: job.approved_estimate_count > 0,
      has_active_visit: job.active_visit_count > 0,
      pipeline_stage: pipelineStage,
      pipeline_stage_label: PIPELINE_STAGE_LABELS[pipelineStage],
      next_action: getPipelineNextAction(pipelineStage),
    };
  });

  const totalActive = jobs.filter(
    (j) => !["completed", "invoiced", "cancelled"].includes(j.status)
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title="Workflow"
        subtitle={`${totalActive} active job${totalActive !== 1 ? "s" : ""}`}
        actions={<NewLeadButton />}
      />
      {jobs.length === 0 ? (
        <div
          style={{
            padding: "var(--space-12) var(--space-6)",
            textAlign: "center",
            color: "var(--fg-muted)",
          }}
        >
          <p style={{ marginBottom: "var(--space-2)", fontWeight: "var(--font-semibold)" }}>
            No requests or jobs yet.
          </p>
          <p style={{ fontSize: "var(--text-sm)" }}>
            Click <strong>+ New Request</strong> to capture a request from text, call, or email.
          </p>
        </div>
      ) : (
        <JobBoard
          jobs={jobs}
          groupBy="pipeline_stage"
          statusLabels={PIPELINE_STAGE_LABELS}
          statusOrder={[...PIPELINE_STAGE_ORDER]}
        />
      )}
    </PageContainer>
  );
}
