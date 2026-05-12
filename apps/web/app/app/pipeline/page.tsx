import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canViewAllJobs } from "@/lib/auth/permissions";
import type { JobStatus } from "@ai-fsm/domain";
import { PageContainer, PageHeader } from "@/components/ui";
import { JobBoard } from "@/app/app/jobs/JobBoard";
import { NewLeadButton } from "./NewLeadButton";

export const dynamic = "force-dynamic";

type JobRow = {
  id: string;
  title: string;
  status: string;
  priority: number;
  client_name: string | null;
  scheduled_start: string | null;
  has_approved_estimate: boolean;
  has_active_visit: boolean;
  sub_status: string | null;
};

const PIPELINE_STATUS_ORDER: JobStatus[] = [
  "draft",
  "quoted",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
];

const PIPELINE_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Intake",
  quoted: "Estimate",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

export default async function PipelinePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllJobs(session.role);
  if (!isAdmin) redirect("/app/my-day");

  const jobs = await query<JobRow>(
    `SELECT j.id, j.title, j.status, j.priority, j.scheduled_start, j.sub_status,
            c.name AS client_name,
            EXISTS(
              SELECT 1 FROM estimates e
              WHERE e.job_id = j.id AND e.account_id = j.account_id AND e.status = 'approved'
            ) AS has_approved_estimate,
            EXISTS(
              SELECT 1 FROM visits va
              WHERE va.job_id = j.id AND va.account_id = j.account_id
                AND va.status NOT IN ('cancelled','completed')
            ) AS has_active_visit
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     WHERE j.account_id = $1 AND j.status != 'cancelled'
     ORDER BY j.priority DESC, j.created_at DESC
     LIMIT 200`,
    [session.accountId]
  );

  const totalActive = jobs.filter(
    (j) => !["completed", "invoiced"].includes(j.status)
  ).length;

  return (
    <PageContainer>
      <PageHeader
        title="Pipeline"
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
            No jobs in the pipeline yet.
          </p>
          <p style={{ fontSize: "var(--text-sm)" }}>
            Click <strong>+ New Lead</strong> to capture a lead from a text, call, or email.
          </p>
        </div>
      ) : (
        <JobBoard
          jobs={jobs}
          statusLabels={PIPELINE_STATUS_LABELS}
          statusOrder={PIPELINE_STATUS_ORDER}
        />
      )}
    </PageContainer>
  );
}
