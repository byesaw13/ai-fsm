import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import {
  canTransitionVisit,
  canAssignVisit,
  canUpdateVisitNotes,
  canUpdateChecklist,
} from "@/lib/auth/permissions";
import type { Visit, VisitStatus } from "@ai-fsm/domain";
import { VisitAssignForm } from "./VisitAssignForm";
import { VisitRescheduleForm } from "./VisitRescheduleForm";
import { VisitTransitionForm } from "./VisitTransitionForm";
import { VisitNotesForm } from "./VisitNotesForm";
import { VisitChecklistForm } from "./VisitChecklistForm";
import { MaterialsUsedForm } from "./MaterialsUsedForm";
import { VisitIssuePanel } from "./VisitIssuePanel";
import { VisitResolutionPanel } from "./VisitResolutionPanel";
import { VisitPartsPanel } from "./VisitPartsPanel";
import { VisitClosingChecklist } from "./VisitClosingChecklist";
import {
  Card,
  EmptyState,
  LinkButton,
  LocalTime,
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
import { withChecklistContext, getOrSeedChecklist } from "@/lib/visits/checklist";

export const dynamic = "force-dynamic";

interface PhotoMeta extends Record<string, unknown> {
  id: string;
  original_name: string;
  created_at: string;
}

interface PartRow extends Record<string, unknown> {
  id: string;
  name: string;
  quantity: number;
  actual_cost_cents: number;
  customer_price_cents: number;
  receipt_media_id: string | null;
}

type VisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
  job_type: string | null;
  job_description: string | null;
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
    `SELECT v.*, j.title AS job_title, j.job_type AS job_type, j.description AS job_description, u.full_name AS assigned_user_name
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
  const canTransition = canTransitionVisit(session.role);
  const canAssign = canAssignVisit(session.role);
  const canNotes = canUpdateVisitNotes(session.role);
  const canChecklist = canUpdateChecklist(session.role);
  const canReschedule = canAssign && !["completed", "cancelled"].includes(currentStatus);
  const canDeleteMedia = session.role !== "tech";

  const assignableUsers = canAssign
    ? await query<{ id: string; full_name: string; role: string; [key: string]: unknown }>(
        `SELECT id, full_name, role FROM users WHERE account_id = $1 ORDER BY full_name ASC`,
        [session.accountId]
      )
    : [];

  const isRepairFlow = visit.job_type !== null && visit.job_type !== "maintenance";

  // Load checklist (lazy-seeded on first access) unless visit is cancelled
  const checklistItems =
    currentStatus !== "cancelled"
      ? await withChecklistContext(session, (client) =>
          getOrSeedChecklist(client, session.accountId, id, visit.job_type ?? undefined)
        )
      : [];

  // Load media and parts for repair/painting/custom visits
  const [beforePhotos, afterPhotos, visitParts] =
    isRepairFlow && currentStatus !== "cancelled"
      ? await Promise.all([
          query<PhotoMeta>(
            `SELECT id, original_name, created_at FROM visit_media
             WHERE visit_id = $1 AND account_id = $2 AND category = 'before'
             ORDER BY created_at`,
            [id, session.accountId]
          ),
          query<PhotoMeta>(
            `SELECT id, original_name, created_at FROM visit_media
             WHERE visit_id = $1 AND account_id = $2 AND category = 'after'
             ORDER BY created_at`,
            [id, session.accountId]
          ),
          query<PartRow>(
            `SELECT id, name, quantity, actual_cost_cents, customer_price_cents, receipt_media_id
             FROM visit_parts WHERE visit_id = $1 AND account_id = $2
             ORDER BY created_at`,
            [id, session.accountId]
          ),
        ])
      : [[] as PhotoMeta[], [] as PhotoMeta[], [] as PartRow[]];

  const overdue = isVisitOverdue(visit);

  // pg returns timestamptz as Date objects — normalise to ISO strings throughout
  const toISO = (v: unknown): string =>
    v instanceof Date ? v.toISOString() : String(v);

  const timelineEntries: TimelineEntryData[] = [
    {
      id: "scheduled",
      timestamp: toISO(visit.scheduled_start),
      title: `Scheduled · ${formatVisitDateLabel(visit.scheduled_start)}`,
      subtitle: `${formatVisitTime(visit.scheduled_start)}–${formatVisitTime(visit.scheduled_end)}`,
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
            timestamp: toISO(visit.arrived_at),
            title: "Arrived on site",
            subtitle: <LocalTime iso={toISO(visit.arrived_at)} />,
            status: "arrived",
            isCompleted: true,
          } satisfies TimelineEntryData,
        ]
      : []),
    ...(visit.completed_at
      ? [
          {
            id: "completed",
            timestamp: toISO(visit.completed_at),
            title: "Visit completed",
            subtitle: <LocalTime iso={toISO(visit.completed_at)} />,
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

          {/* ── Maintenance flow: full 28-item walkthrough ── */}
          {!isRepairFlow && currentStatus !== "cancelled" && checklistItems.length > 0 && (
            <Card data-testid="visit-checklist-panel">
              <SectionHeader title="Walkthrough Checklist" />
              <VisitChecklistForm
                visitId={visit.id}
                initialItems={checklistItems}
                canUpdate={canChecklist}
              />
            </Card>
          )}

          {/* ── Repair / painting / custom flow ── */}
          {isRepairFlow && currentStatus !== "cancelled" && (
            <>
              <Card>
                <SectionHeader title="Issue" />
                <VisitIssuePanel
                  visitId={visit.id}
                  initialDescription={(visit as VisitRow & { issue_description?: string | null }).issue_description ?? null}
                  jobDescription={visit.job_description}
                  initialPhotos={beforePhotos}
                  canUpdate={canNotes}
                  canDelete={canDeleteMedia}
                />
              </Card>

              <Card>
                <SectionHeader title="Parts" />
                <VisitPartsPanel
                  visitId={visit.id}
                  initialParts={visitParts}
                  canUpdate={canNotes}
                  jobType={visit.job_type}
                />
              </Card>

              <Card>
                <SectionHeader title="Resolution" />
                <VisitResolutionPanel
                  visitId={visit.id}
                  initialNotes={visit.tech_notes ?? null}
                  initialPhotos={afterPhotos}
                  canUpdate={canNotes}
                  canDelete={canDeleteMedia}
                />
              </Card>

              {currentStatus !== "completed" && (
                <Card>
                  <SectionHeader title="Closing Checklist" />
                  <VisitClosingChecklist
                    visitId={visit.id}
                    initialItems={checklistItems}
                    canUpdate={canChecklist}
                  />
                </Card>
              )}
            </>
          )}

          {canTransition && currentStatus !== "completed" && currentStatus !== "cancelled" && (
            <Card data-testid="visit-transition-panel">
              <SectionHeader title={session.role === "tech" ? "Actions" : "Status Actions"} />
              <VisitTransitionForm
                visitId={visit.id}
                currentStatus={currentStatus}
                role={session.role}
                jobType={visit.job_type ?? undefined}
                beforePhotoCount={beforePhotos.length}
                afterPhotoCount={afterPhotos.length}
                closingAllDone={checklistItems.length > 0 && checklistItems.every((i) => i.disposition === "ok")}
              />
            </Card>
          )}

          {/* ── Maintenance: show notes and materials panels ── */}
          {!isRepairFlow && canNotes && (
            <Card data-testid="visit-notes-panel">
              <SectionHeader title="Tech Notes" />
              <VisitNotesForm visitId={visit.id} initialNotes={visit.tech_notes ?? ""} />
            </Card>
          )}

          {!isRepairFlow && currentStatus !== "cancelled" && (
            <Card data-testid="materials-used-panel">
              <SectionHeader title="Materials Used" />
              <MaterialsUsedForm
                visitId={visit.id}
                initialValue={(visit as Visit & { materials_used?: string | null }).materials_used ?? null}
                canUpdate={canNotes}
              />
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

          {canReschedule && (
            <VisitRescheduleForm
              visitId={visit.id}
              initialStart={visit.scheduled_start}
              initialEnd={visit.scheduled_end}
            />
          )}

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
              {visit.job_type && (
                <div className="p7-detail-row">
                  <dt>Type</dt>
                  <dd style={{ textTransform: "capitalize" }}>{visit.job_type}</dd>
                </div>
              )}
              <div className="p7-detail-row">
                <dt>Scheduled</dt>
                <dd><LocalTime iso={toISO(visit.scheduled_start)} /></dd>
              </div>
              <div className="p7-detail-row">
                <dt>Ends</dt>
                <dd><LocalTime iso={toISO(visit.scheduled_end)} /></dd>
              </div>
              {visit.arrived_at && (
                <div className="p7-detail-row">
                  <dt>Arrived</dt>
                  <dd><LocalTime iso={toISO(visit.arrived_at)} /></dd>
                </div>
              )}
              {visit.completed_at && (
                <div className="p7-detail-row">
                  <dt>Completed</dt>
                  <dd><LocalTime iso={toISO(visit.completed_at)} /></dd>
                </div>
              )}
            </dl>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
