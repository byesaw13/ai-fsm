import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { queryOne, query } from "@/lib/db";
import {
  canTransitionJob,
  canCreateVisit,
  canDeleteRecords,
} from "@/lib/auth/permissions";
import { jobTransitions } from "@ai-fsm/domain";
import type { Job, Visit, JobStatus, VisitStatus } from "@ai-fsm/domain";
import { JobTransitionForm } from "./JobTransitionForm";
import { DeleteJobButton } from "./DeleteJobButton";

export const dynamic = "force-dynamic";

type JobRow = Job & { client_name: string | null };
type VisitRow = Visit & { assigned_user_name: string | null };

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const job = await queryOne<JobRow>(
    `SELECT j.*, c.name AS client_name
     FROM jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     WHERE j.id = $1 AND j.account_id = $2`,
    [id, session.accountId]
  );

  if (!job) notFound();

  // tech: only see this job if they have an assigned visit
  if (session.role === "tech") {
    const assigned = await queryOne(
      `SELECT id FROM visits WHERE job_id = $1 AND account_id = $2 AND assigned_user_id = $3 LIMIT 1`,
      [id, session.accountId, session.userId]
    );
    if (!assigned) notFound();
  }

  let visits: VisitRow[];
  if (session.role === "tech") {
    visits = await query<VisitRow>(
      `SELECT v.*, u.full_name AS assigned_user_name
       FROM visits v
       LEFT JOIN users u ON u.id = v.assigned_user_id
       WHERE v.job_id = $1 AND v.account_id = $2 AND v.assigned_user_id = $3
       ORDER BY v.scheduled_start ASC`,
      [id, session.accountId, session.userId]
    );
  } else {
    visits = await query<VisitRow>(
      `SELECT v.*, u.full_name AS assigned_user_name
       FROM visits v
       LEFT JOIN users u ON u.id = v.assigned_user_id
       WHERE v.job_id = $1 AND v.account_id = $2
       ORDER BY v.scheduled_start ASC`,
      [id, session.accountId]
    );
  }

  const currentStatus = job.status as JobStatus;
  const allowedTransitions = jobTransitions[currentStatus];
  const canTransition = canTransitionJob(session.role);
  const canAddVisit = canCreateVisit(session.role);
  const canDelete = canDeleteRecords(session.role);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href="/app/jobs" className="back-link">
            ← Jobs
          </Link>
          <h1 className="page-title">{job.title}</h1>
          {job.client_name && (
            <p className="page-subtitle">{job.client_name}</p>
          )}
        </div>
        <span className={`status-pill status-${job.status}`} data-testid="job-status">
          {JOB_STATUS_LABELS[currentStatus]}
        </span>
      </div>

      {/* Job Details */}
      <div className="card detail-card">
        <h2>Details</h2>
        {job.description && <p>{job.description}</p>}
        {job.scheduled_start && (
          <p>
            <strong>Starts:</strong>{" "}
            {new Date(job.scheduled_start).toLocaleString()}
          </p>
        )}
        {job.scheduled_end && (
          <p>
            <strong>Ends:</strong>{" "}
            {new Date(job.scheduled_end).toLocaleString()}
          </p>
        )}
      </div>

      {/* Status Transitions — admin/owner only */}
      {canTransition && allowedTransitions.length > 0 && (
        <div className="card action-card" data-testid="job-transition-panel">
          <h2>Transition Status</h2>
          <JobTransitionForm
            jobId={job.id}
            allowedTransitions={allowedTransitions as JobStatus[]}
            statusLabels={JOB_STATUS_LABELS}
          />
        </div>
      )}

      {/* Visits */}
      <div className="card">
        <div className="section-header">
          <h2>Visits ({visits.length})</h2>
          {canAddVisit && (
            <Link
              href={`/app/jobs/${job.id}/visits/new`}
              className="btn btn-primary btn-sm"
              data-testid="add-visit-btn"
            >
              + Schedule Visit
            </Link>
          )}
        </div>

        {visits.length === 0 ? (
          <p className="muted" data-testid="visits-empty">
            No visits scheduled yet.{canAddVisit ? " Use the button above to schedule the first visit." : ""}
          </p>
        ) : (
          <div className="visit-list">
            {visits.map((visit) => (
              <Link
                key={visit.id}
                href={`/app/visits/${visit.id}`}
                className="visit-card"
                data-testid="visit-card"
                data-status={visit.status}
              >
                <div className="visit-card-header">
                  <span>
                    {new Date(visit.scheduled_start).toLocaleDateString()}{" "}
                    {new Date(visit.scheduled_start).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className={`status-pill status-${visit.status}`}>
                    {VISIT_STATUS_LABELS[visit.status as VisitStatus]}
                  </span>
                </div>
                {visit.assigned_user_name && (
                  <p className="muted">Tech: {visit.assigned_user_name}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Danger Zone — owner only */}
      {canDelete && currentStatus === "draft" && (
        <div className="card danger-card" data-testid="danger-zone">
          <h2>Danger Zone</h2>
          <p className="muted">Delete this job permanently. Only available for draft jobs.</p>
          <DeleteJobButton jobId={job.id} />
        </div>
      )}
    </div>
  );
}
