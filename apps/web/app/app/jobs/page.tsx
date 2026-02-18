import { redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import { canTransitionJob, canViewAllJobs } from "@/lib/auth/permissions";
import type { Job, JobStatus } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

type JobRow = Job & { client_name: string | null };

const STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const STATUS_ORDER: JobStatus[] = [
  "in_progress",
  "scheduled",
  "quoted",
  "draft",
  "completed",
  "invoiced",
  "cancelled",
];

export default async function JobsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllJobs(session.role);

  let jobs: JobRow[];
  if (isAdmin) {
    jobs = await query<JobRow>(
      `SELECT j.*, c.name AS client_name
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE j.account_id = $1
       ORDER BY j.created_at DESC
       LIMIT 100`,
      [session.accountId]
    );
  } else {
    // tech: only jobs with at least one visit assigned to this user
    jobs = await query<JobRow>(
      `SELECT DISTINCT j.*, c.name AS client_name
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       JOIN visits v ON v.job_id = j.id AND v.assigned_user_id = $2
       WHERE j.account_id = $1
       ORDER BY j.created_at DESC
       LIMIT 100`,
      [session.accountId, session.userId]
    );
  }

  const grouped = STATUS_ORDER.reduce<Record<string, JobRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );
  for (const job of jobs) {
    grouped[job.status]?.push(job);
  }

  const activeStatuses = STATUS_ORDER.filter((s) => grouped[s].length > 0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jobs</h1>
          <p className="page-subtitle">
            {isAdmin
              ? `All jobs — ${jobs.length} total`
              : `Your assigned jobs — ${jobs.length} total`}
          </p>
        </div>
        {canTransitionJob(session.role) && (
          <Link href="/app/jobs/new" className="btn btn-primary" data-testid="create-job-btn">
            + New Job
          </Link>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state" data-testid="jobs-empty">
          <p>
            {isAdmin
              ? "No jobs yet. Create your first job to get started."
              : "No assigned jobs found."}
          </p>
        </div>
      ) : (
        <div className="status-sections">
          {activeStatuses.map((status) => (
            <section key={status} className="status-section">
              <h2 className="status-heading" data-status={status}>
                {STATUS_LABELS[status]}
                <span className="count-badge">{grouped[status].length}</span>
              </h2>
              <div className="job-list">
                {grouped[status].map((job) => (
                  <Link
                    key={job.id}
                    href={`/app/jobs/${job.id}`}
                    className="job-card"
                    data-testid="job-card"
                    data-status={job.status}
                  >
                    <div className="job-card-header">
                      <span className="job-title">{job.title}</span>
                      <span className={`status-pill status-${job.status}`}>
                        {STATUS_LABELS[job.status as JobStatus]}
                      </span>
                    </div>
                    {job.client_name && (
                      <p className="job-client">{job.client_name}</p>
                    )}
                    {job.scheduled_start && (
                      <p className="job-date">
                        {new Date(job.scheduled_start).toLocaleDateString()}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
