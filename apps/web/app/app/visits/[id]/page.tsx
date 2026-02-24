import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import {
  canTransitionVisit,
  canAssignVisit,
  canUpdateVisitNotes,
} from "@/lib/auth/permissions";
import { visitTransitions } from "@ai-fsm/domain";
import type { Visit, VisitStatus } from "@ai-fsm/domain";
import { VisitAssignForm } from "./VisitAssignForm";
import { VisitTransitionForm } from "./VisitTransitionForm";
import { VisitNotesForm } from "./VisitNotesForm";
import {
  Card,
  EmptyState,
  LinkButton,
  PageContainer,
  PageHeader,
  SectionHeader,
  StatusBadge,
  Timeline,
} from "@/components/ui";
import type { TimelineEntryData, StatusVariant } from "@/components/ui";
import {
  formatVisitDateLabel,
  formatVisitTime,
  isVisitOverdue,
} from "@/lib/visits/p7";

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
  if (session.role === "tech" && visit.assigned_user_id !== session.userId) {
    notFound();
  }

  const currentStatus = visit.status as VisitStatus;
  const allowedTransitions = visitTransitions[currentStatus] as VisitStatus[];
  const canTransition = canTransitionVisit(session.role);
  const canAssign = canAssignVisit(session.role);
  const canNotes = canUpdateVisitNotes(session.role);

  const assignableUsers = canAssign
    ? await query<{ id: string; full_name: string; role: string; [key: string]: unknown }>(
        `SELECT id, full_name, role FROM users WHERE account_id = $1 ORDER BY full_name ASC`,
        [session.accountId]
      )
    : [];

  const overdue = isVisitOverdue(visit);

  const timelineEntries: TimelineEntryData[] = [
    {
      id: "scheduled",
      timestamp: visit.scheduled_start,
      title: `Scheduled · ${formatVisitDateLabel(visit.scheduled_start)}`,
      subtitle: `${formatVisitTime(visit.scheduled_start)}–${formatVisitTime(
        visit.scheduled_end
      )}`,
      status: "scheduled",
      badge: overdue ? (
        <span className="p7-badge p7-badge-status-overdue">Overdue</span>
      ) : undefined,
      isCompleted: true,
    },
    ...(visit.arrived_at
      ? [
          {
            id: "arrived",
            timestamp: visit.arrived_at,
            title: "Arrived on site",
            subtitle: new Date(visit.arrived_at).toLocaleString(),
            status: "arrived",
            isCompleted: true,
          } satisfies TimelineEntryData,
        ]
      : []),
    ...(visit.completed_at
      ? [
          {
            id: "completed",
            timestamp: visit.completed_at,
            title: "Visit completed",
            subtitle: new Date(visit.completed_at).toLocaleString(),
            status: "completed",
            isCompleted: true,
          } satisfies TimelineEntryData,
        ]
      : []),
  ];

  return (
    <PageContainer>
      <PageHeader
        title={`Visit — ${formatVisitDateLabel(visit.scheduled_start)}`}
        subtitle={`${formatVisitTime(visit.scheduled_start)} – ${formatVisitTime(
          visit.scheduled_end
        )}`}
        backHref={visit.job_id ? `/app/jobs/${visit.job_id}` : "/app/visits"}
        backLabel={visit.job_title ?? "Visits"}
        actions={
          <span data-testid="visit-status">
            <StatusBadge variant={visit.status as StatusVariant}>
              {VISIT_STATUS_LABELS[currentStatus]}
            </StatusBadge>
          </span>
        }
      />

      <div className="p7-detail-layout">
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader title="Visit Timeline" />
            <Timeline entries={timelineEntries} />
          </Card>

          {canTransition && allowedTransitions.length > 0 && (
            <Card data-testid="visit-transition-panel">
              <SectionHeader title="Status Actions" />
              <VisitTransitionForm
                visitId={visit.id}
                allowedTransitions={allowedTransitions}
                statusLabels={VISIT_STATUS_LABELS}
              />
            </Card>
          )}

          {canNotes && (
            <Card data-testid="visit-notes-panel">
              <SectionHeader title="Tech Notes" />
              <VisitNotesForm visitId={visit.id} initialNotes={visit.tech_notes ?? ""} />
            </Card>
          )}
        </div>

        <div className="p7-detail-sidebar">
          <Card>
            <SectionHeader title="Assignment" />
            {canAssign ? (
              <VisitAssignForm
                visitId={visit.id}
                users={assignableUsers}
                currentAssignedId={visit.assigned_user_id ?? null}
              />
            ) : visit.assigned_user_name ? (
              <dl className="p7-detail-list">
                <div className="p7-detail-row">
                  <dt>Assigned To</dt>
                  <dd data-testid="assigned-tech">{visit.assigned_user_name}</dd>
                </div>
              </dl>
            ) : (
              <EmptyState
                title="Unassigned"
                description="No technician has been assigned to this visit."
                data-testid="unassigned-badge"
              />
            )}
          </Card>

          <Card>
            <SectionHeader title="Visit Details" />
            <dl className="p7-detail-list">
              {visit.job_title && (
                <div className="p7-detail-row">
                  <dt>Job</dt>
                  <dd>
                    {visit.job_id ? (
                      <LinkButton href={`/app/jobs/${visit.job_id}`} variant="ghost" size="sm">
                        {visit.job_title}
                      </LinkButton>
                    ) : (
                      visit.job_title
                    )}
                  </dd>
                </div>
              )}
              <div className="p7-detail-row">
                <dt>Scheduled</dt>
                <dd>{new Date(visit.scheduled_start).toLocaleString()}</dd>
              </div>
              <div className="p7-detail-row">
                <dt>Ends</dt>
                <dd>{new Date(visit.scheduled_end).toLocaleString()}</dd>
              </div>
              {visit.arrived_at && (
                <div className="p7-detail-row">
                  <dt>Arrived</dt>
                  <dd>{new Date(visit.arrived_at).toLocaleString()}</dd>
                </div>
              )}
              {visit.completed_at && (
                <div className="p7-detail-row">
                  <dt>Completed</dt>
                  <dd>{new Date(visit.completed_at).toLocaleString()}</dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
