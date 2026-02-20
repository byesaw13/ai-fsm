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

const PRIORITY_LABELS: Record<number, string> = {
  0: "",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

function getPriorityClass(priority: number): string {
  if (priority >= 4) return "priority-urgent";
  if (priority === 3) return "priority-high";
  if (priority === 2) return "priority-medium";
  if (priority === 1) return "priority-low";
  return "";
}

interface PageProps {
  searchParams: Promise<{ q?: string; status?: string }>;
}

export default async function JobsPage({ searchParams }: PageProps) {
  const { q, status } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = canViewAllJobs(session.role);
  const canCreate = canTransitionJob(session.role);

  const searchPattern = q ? `%${q.toLowerCase()}%` : null;
  const statusFilter = status && STATUS_ORDER.includes(status as JobStatus) ? status : null;

  let jobs: JobRow[];
  if (isAdmin) {
    const conditions: string[] = ["j.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let paramIdx = 2;

    if (searchPattern) {
      conditions.push(`(LOWER(j.title) LIKE $${paramIdx} OR LOWER(c.name) LIKE $${paramIdx})`);
      params.push(searchPattern);
      paramIdx++;
    }

    if (statusFilter) {
      conditions.push(`j.status = $${paramIdx}`);
      params.push(statusFilter);
      paramIdx++;
    }

    jobs = await query<JobRow>(
      `SELECT j.*, c.name AS client_name
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY j.priority DESC, j.created_at DESC
       LIMIT 100`,
      params
    );
  } else {
    const conditions: string[] = ["j.account_id = $1", "v.assigned_user_id = $2"];
    const params: unknown[] = [session.accountId, session.userId];
    let paramIdx = 3;

    if (searchPattern) {
      conditions.push(`(LOWER(j.title) LIKE $${paramIdx} OR LOWER(c.name) LIKE $${paramIdx})`);
      params.push(searchPattern);
      paramIdx++;
    }

    if (statusFilter) {
      conditions.push(`j.status = $${paramIdx}`);
      params.push(statusFilter);
      paramIdx++;
    }

    jobs = await query<JobRow>(
      `SELECT DISTINCT j.*, c.name AS client_name
       FROM jobs j
       LEFT JOIN clients c ON c.id = j.client_id
       JOIN visits v ON v.job_id = j.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY j.priority DESC, j.created_at DESC
       LIMIT 100`,
      params
    );
  }

  const grouped = STATUS_ORDER.reduce<Record<string, JobRow[]>>(
    (acc, s) => ({ ...acc, [s]: [] }),
    {}
  );

  for (const job of jobs) {
    if (!statusFilter) {
      grouped[job.status]?.push(job);
    }
  }

  const activeStatuses = statusFilter
    ? [statusFilter as JobStatus]
    : STATUS_ORDER.filter((s) => grouped[s].length > 0);

  const activeFilters = [];
  if (q) activeFilters.push(`search: "${q}"`);
  if (statusFilter) activeFilters.push(`status: ${STATUS_LABELS[statusFilter as JobStatus]}`);

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
        {canCreate && (
          <Link href="/app/jobs/new" className="btn btn-primary" data-testid="create-job-btn">
            + New Job
          </Link>
        )}
      </div>

      <div className="filter-bar">
        <form method="GET" className="filter-form">
          <input
            type="text"
            name="q"
            placeholder="Search jobs..."
            defaultValue={q || ""}
            className="filter-input"
          />
          <select name="status" className="filter-select" defaultValue={statusFilter || ""}>
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">
            Filter
          </button>
          {(q || statusFilter) && (
            <Link href="/app/jobs" className="btn btn-secondary btn-sm">
              Clear
            </Link>
          )}
        </form>
        {activeFilters.length > 0 && (
          <p className="filter-active">Filtered by {activeFilters.join(", ")}</p>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state" data-testid="jobs-empty">
          <div className="empty-state-icon">📋</div>
          <p className="empty-state-title">
            {q || statusFilter
              ? "No jobs match your filters"
              : isAdmin
                ? "No jobs yet"
                : "No assigned jobs"}
          </p>
          <p className="empty-state-desc">
            {q || statusFilter
              ? "Try adjusting your search or filters."
              : isAdmin
                ? "Create your first job to start tracking work."
                : "Jobs will appear here when you're assigned to visits."}
          </p>
          {canCreate && !q && !statusFilter && (
            <Link href="/app/jobs/new" className="btn btn-primary">
              Create First Job
            </Link>
          )}
        </div>
      ) : statusFilter ? (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
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
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: JobRow }) {
  const priorityClass = getPriorityClass(job.priority);
  const priorityLabel = PRIORITY_LABELS[job.priority] || "";

  return (
    <Link
      href={`/app/jobs/${job.id}`}
      className="job-card"
      data-testid="job-card"
      data-status={job.status}
      data-priority={job.priority}
    >
      <div className="job-card-header">
        <div className="job-card-title-row">
          <span className="job-title">{job.title}</span>
          {priorityLabel && (
            <span className={`priority-badge ${priorityClass}`} title={`Priority: ${priorityLabel}`}>
              {priorityLabel}
            </span>
          )}
        </div>
        <span className={`status-pill status-${job.status}`}>
          {STATUS_LABELS[job.status as JobStatus]}
        </span>
      </div>
      <div className="job-card-meta">
        {job.client_name && (
          <span className="job-client">{job.client_name}</span>
        )}
        {job.scheduled_start && (
          <span className="job-date">
            {new Date(job.scheduled_start).toLocaleDateString()}
          </span>
        )}
      </div>
    </Link>
  );
}
