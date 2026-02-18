import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { queryOne } from "@/lib/db";
import {
  canTransitionVisit,
  canAssignVisit,
  canUpdateVisitNotes,
} from "@/lib/auth/permissions";
import { visitTransitions } from "@ai-fsm/domain";
import type { Visit, VisitStatus } from "@ai-fsm/domain";
import { VisitTransitionForm } from "./VisitTransitionForm";
import { VisitNotesForm } from "./VisitNotesForm";

export const dynamic = "force-dynamic";

type VisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
};

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default async function VisitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const visit = await queryOne<VisitRow>(
    `SELECT v.*, j.title AS job_title, u.full_name AS assigned_user_name
     FROM visits v
     LEFT JOIN jobs j ON j.id = v.job_id
     LEFT JOIN users u ON u.id = v.assigned_user_id
     WHERE v.id = $1 AND v.account_id = $2`,
    [id, session.accountId]
  );

  if (!visit) notFound();

  // tech: must be the assigned user
  if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
    notFound();
  }

  const currentStatus = visit.status as VisitStatus;
  const allowedTransitions = visitTransitions[currentStatus];
  const canTransition = canTransitionVisit(session.role);
  const canAssign = canAssignVisit(session.role);
  const canNotes = canUpdateVisitNotes(session.role);

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          {visit.job_id && (
            <Link href={`/app/jobs/${visit.job_id}`} className="back-link">
              ← {visit.job_title ?? "Job"}
            </Link>
          )}
          <h1 className="page-title">
            Visit —{" "}
            {new Date(visit.scheduled_start).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </h1>
          <p className="page-subtitle">
            {new Date(visit.scheduled_start).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            –{" "}
            {new Date(visit.scheduled_end).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <span
          className={`status-pill status-${visit.status}`}
          data-testid="visit-status"
        >
          {VISIT_STATUS_LABELS[currentStatus]}
        </span>
      </div>

      {/* Assignment info */}
      <div className="card detail-card">
        <h2>Assignment</h2>
        <p data-testid="assigned-tech">
          {visit.assigned_user_name ? (
            <>
              <strong>Assigned to:</strong> {visit.assigned_user_name}
            </>
          ) : (
            <span className="unassigned-badge" data-testid="unassigned-badge">
              Unassigned
            </span>
          )}
        </p>
        {canAssign && (
          <p className="muted" data-testid="assign-note">
            Assignment can be updated via the visits API.
          </p>
        )}
        {visit.arrived_at && (
          <p>
            <strong>Arrived:</strong>{" "}
            {new Date(visit.arrived_at).toLocaleString()}
          </p>
        )}
        {visit.completed_at && (
          <p>
            <strong>Completed:</strong>{" "}
            {new Date(visit.completed_at).toLocaleString()}
          </p>
        )}
      </div>

      {/* Status Transitions — all roles, guard enforced */}
      {canTransition && allowedTransitions.length > 0 && (
        <div className="card action-card" data-testid="visit-transition-panel">
          <h2>Update Status</h2>
          <VisitTransitionForm
            visitId={visit.id}
            allowedTransitions={allowedTransitions as VisitStatus[]}
            statusLabels={VISIT_STATUS_LABELS}
          />
        </div>
      )}

      {/* Tech notes — all roles */}
      {canNotes && (
        <div className="card" data-testid="visit-notes-panel">
          <h2>Tech Notes</h2>
          <VisitNotesForm
            visitId={visit.id}
            initialNotes={visit.tech_notes ?? ""}
          />
        </div>
      )}
    </div>
  );
}
