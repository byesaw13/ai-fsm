import { redirect, notFound } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import {
  canTransitionVisit,
  canAssignVisit,
  canUpdateVisitNotes,
  canUpdateChecklist,
} from "@/lib/auth/permissions";
import {
  getVaultCollectionStep,
  VISIT_SUB_STATUSES,
  SUB_STATUS_LABELS,
  ROUTING_ZONE_WARNINGS,
  ROUTING_ZONE_WARNING_ZONES,
  type Visit,
  type VisitStatus,
  type MembershipVisitPhase,
  type MembershipCapStatus,
  type VaultCategory,
  type VaultCollectionStep,
  type MembershipRoutingZone,
} from "@ai-fsm/domain";
import { VisitAssignForm } from "./VisitAssignForm";
import { OverdueVisitModal } from "./OverdueVisitModal";
import { VisitRescheduleForm } from "./VisitRescheduleForm";
import { VisitTransitionForm } from "./VisitTransitionForm";
import { VisitNotesForm } from "./VisitNotesForm";
import { VisitChecklistForm } from "./VisitChecklistForm";
import { MaterialsUsedForm } from "./MaterialsUsedForm";
import { VisitIssuePanel } from "./VisitIssuePanel";
import { VisitResolutionPanel } from "./VisitResolutionPanel";
import { VisitPartsPanel } from "./VisitPartsPanel";
import { VisitClosingChecklist } from "./VisitClosingChecklist";
import { CompletionChecklist } from "./CompletionChecklist";
import { SubStatusSelect } from "@/components/SubStatusSelect";
import { MembershipVisitPanel } from "./MembershipVisitPanel";
import { VisitSnapshotPanel } from "./VisitSnapshotPanel";
import { VisitCommandBanner } from "./VisitCommandBanner";
import { OnMyWayButton } from "./OnMyWayButton";
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

interface CompletionPacketRow extends Record<string, unknown> {
  photo_urls: string[];
  signature_url: string | null;
  signature_waiver: boolean;
  notes: string | null;
}

type VisitRow = Visit & {
  job_title: string | null;
  assigned_user_name: string | null;
  job_type: string | null;
  job_description: string | null;
  job_property_id: string | null;
  job_client_id: string | null;
  generated_from_plan_id: string | null;
  plan_annual_visit_count: number | null;
  plan_routing_zone: string | null;
  membership_visit_phase: MembershipVisitPhase;
  included_labor_cap_minutes: number | null;
  included_labor_minutes_used: number;
  membership_cap_status: MembershipCapStatus;
  membership_snapshot_sent_at: string | Date | null;
  sub_status: string | null;
  visit_type: string | null;
};

type CountRow = { membership_visit_number: number | string };
type VaultCategoryRow = { category: VaultCategory };

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
    `SELECT v.*,
            j.title AS job_title, j.job_type AS job_type, j.description AS job_description,
            j.property_id AS job_property_id, j.client_id AS job_client_id,
            mp.annual_visit_count AS plan_annual_visit_count,
            mp.routing_zone AS plan_routing_zone,
            u.full_name AS assigned_user_name
     FROM visits v
     LEFT JOIN jobs j ON j.id = v.job_id
     LEFT JOIN maintenance_plans mp ON mp.id = v.generated_from_plan_id AND mp.account_id = v.account_id
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
  const isMembershipVisit = visit.generated_from_plan_id !== null;
  const isRealtorBaseline = visit.visit_type === "realtor_baseline";
  const canCreateEstimate = session.role === "owner" || session.role === "admin";
  const routingZoneWarning =
    visit.plan_routing_zone &&
    ROUTING_ZONE_WARNING_ZONES.includes(visit.plan_routing_zone as MembershipRoutingZone)
      ? ROUTING_ZONE_WARNINGS[visit.plan_routing_zone]
      : null;

  const [membershipVisitNumberRow, propertyVaultRows] = isMembershipVisit
    ? await Promise.all([
        queryOne<CountRow>(
          `SELECT COUNT(*)::int AS membership_visit_number
           FROM visits v2
           WHERE v2.generated_from_plan_id = $1
             AND v2.account_id = $2
             AND (
               v2.scheduled_start < $3
               OR (v2.scheduled_start = $3 AND v2.id <= $4)
             )`,
          [visit.generated_from_plan_id, session.accountId, visit.scheduled_start, visit.id]
        ),
        visit.job_property_id
          ? query<VaultCategoryRow>(
              `SELECT DISTINCT category
               FROM property_vault_items
               WHERE property_id = $1 AND account_id = $2`,
              [visit.job_property_id, session.accountId]
            )
          : Promise.resolve([] as VaultCategoryRow[]),
      ])
    : [null, [] as VaultCategoryRow[]];

  const membershipVaultCollection: VaultCollectionStep | null = isMembershipVisit
    ? getVaultCollectionStep({
        annualVisitCount: visit.plan_annual_visit_count ?? 1,
        visitNumber: Number(membershipVisitNumberRow?.membership_visit_number ?? 1),
        recordedCategories: propertyVaultRows.map((row) => row.category),
      })
    : null;

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

  const completionPacket =
    currentStatus !== "cancelled"
      ? await queryOne<CompletionPacketRow>(
          `SELECT photo_urls, signature_url, signature_waiver, notes
           FROM completion_packets
           WHERE visit_id = $1 AND account_id = $2`,
          [id, session.accountId]
        )
      : null;

  const overdue = isVisitOverdue(visit);

  const issueDescription = (visit as VisitRow & { issue_description?: string | null }).issue_description;
  const checklistDone = checklistItems.filter((i) => i.disposition === "ok").length;
  const closingAllDoneForBanner =
    checklistItems.length > 0 && checklistItems.every((i) => i.disposition === "ok");
  // Tech on scheduled/arrived gets the transition card moved to the top
  const showTransitionEarly =
    canTransition &&
    session.role === "tech" &&
    (currentStatus === "scheduled" || currentStatus === "arrived");

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
      {overdue && canReschedule && (currentStatus === "scheduled" || currentStatus === "arrived") && (
        <OverdueVisitModal
          visitId={visit.id}
          scheduledStart={toISO(visit.scheduled_start)}
          scheduledEnd={toISO(visit.scheduled_end)}
          jobTitle={visit.job_title}
        />
      )}
      <PageHeader
        title={`Visit — ${formatVisitDateLabel(visit.scheduled_start)}`}
        subtitle={`${formatVisitTime(visit.scheduled_start)} – ${formatVisitTime(
          visit.scheduled_end
        )}`}
        backHref={visit.job_id ? `/app/jobs/${visit.job_id}` : "/app/visits"}
        backLabel={visit.job_title ?? "Visits"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            {!isRepairFlow && checklistItems.length > 0 &&
              (currentStatus === "completed" || visit.membership_visit_phase === "reporting") && (
              <LinkButton
                href={`/app/visits/${visit.id}/print`}
                variant="ghost"
                size="sm"
                data-testid="print-report-link"
              >
                Print Report
              </LinkButton>
            )}
            <span data-testid="visit-status">
              <StatusBadge variant={visit.status as StatusVariant}>
                {VISIT_STATUS_LABELS[currentStatus]}
              </StatusBadge>
              {visit.sub_status && (
                <span style={{ marginLeft: "var(--space-2)" }}>
                  <StatusBadge variant="overdue">
                    {SUB_STATUS_LABELS[visit.sub_status] ?? visit.sub_status}
                  </StatusBadge>
                </span>
              )}
            </span>
          </div>
        }
      />

      <VisitCommandBanner
        status={currentStatus}
        isRepairFlow={isRepairFlow}
        isMembershipVisit={isMembershipVisit}
        membershipPhase={visit.membership_visit_phase ?? null}
        beforePhotoCount={beforePhotos.length}
        afterPhotoCount={afterPhotos.length}
        hasIssueDescription={!!issueDescription}
        hasTechNotes={!!visit.tech_notes}
        closingAllDone={closingAllDoneForBanner}
        checklistDone={checklistDone}
        checklistTotal={checklistItems.length}
      />

      {/* Routing zone warning — shown for extended / out_of_area membership visits */}
      {routingZoneWarning && (
        <div style={{
          margin: "0 0 var(--space-4)",
          padding: "var(--space-3) var(--space-4)",
          borderRadius: "var(--radius-md)",
          background: "color-mix(in srgb, var(--color-warning, #f59e0b) 12%, transparent)",
          border: "1px solid color-mix(in srgb, var(--color-warning, #f59e0b) 40%, transparent)",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-text-primary)",
        }}>
          <strong>Routing:</strong> {routingZoneWarning}
        </div>
      )}

      <div className="p7-detail-layout">
        <div className="p7-detail-primary">
          {/* For tech on scheduled/arrived: surface the action first, above all work panels */}
          {showTransitionEarly && (
            <Card data-testid="visit-transition-panel">
              <SectionHeader title="Actions" />
              <VisitTransitionForm
                visitId={visit.id}
                currentStatus={currentStatus}
                role={session.role}
                jobType={visit.job_type ?? undefined}
                beforePhotoCount={beforePhotos.length}
                afterPhotoCount={afterPhotos.length}
                closingAllDone={checklistItems.length > 0 && checklistItems.every((i) => i.disposition === "ok")}
                isMembershipVisit={isMembershipVisit}
                membershipPhase={visit.membership_visit_phase ?? "health_check"}
                membershipSnapshotSentAt={
                  visit.membership_snapshot_sent_at ? toISO(visit.membership_snapshot_sent_at) : null
                }
              />
            </Card>
          )}

          <Card>
            <SectionHeader title="Visit Timeline" />
            <Timeline entries={timelineEntries} />
            {currentStatus === "scheduled" && (
              <div style={{ marginTop: "var(--space-4)" }}>
                <OnMyWayButton visitId={visit.id} />
              </div>
            )}
          </Card>

          {/* ── Membership visit: phase stepper + labor cap ── */}
          {isMembershipVisit && !isRepairFlow && currentStatus !== "cancelled" && (
            <Card data-testid="membership-visit-phase-card">
              <SectionHeader title="Membership Visit" />
              <MembershipVisitPanel
                visitId={visit.id}
                phase={visit.membership_visit_phase ?? "health_check"}
                capMinutes={visit.included_labor_cap_minutes}
                minutesUsed={visit.included_labor_minutes_used ?? 0}
                capStatus={visit.membership_cap_status ?? "within_cap"}
                canUpdate={canNotes}
                visitStatus={currentStatus}
                propertyId={visit.job_property_id ?? null}
                vaultCollection={membershipVaultCollection}
              />
            </Card>
          )}

          {/* ── Realtor baseline: membership follow-up prompt when completed ── */}
          {isRealtorBaseline && currentStatus === "completed" && canCreateEstimate && (
            <Card data-testid="realtor-baseline-followup">
              <SectionHeader title="Baseline Complete" />
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: "var(--space-3)" }}>
                The realtor baseline inspection is done. Offer the client a maintenance membership to build on this visit.
              </div>
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                {visit.job_client_id && (
                  <a
                    href={`/app/maintenance-plans/new?client_id=${visit.job_client_id}${visit.job_property_id ? `&property_id=${visit.job_property_id}` : ""}`}
                    className="p7-btn p7-btn-primary p7-btn-sm"
                  >
                    Offer Membership
                  </a>
                )}
                {visit.job_id && (
                  <a href={`/app/jobs/${visit.job_id}`} className="p7-btn p7-btn-secondary p7-btn-sm">
                    Back to Job
                  </a>
                )}
              </div>
            </Card>
          )}

          {/* ── Maintenance flow: full 28-item walkthrough (health_check / included_action phases) ── */}
          {!isRepairFlow && currentStatus !== "cancelled" && checklistItems.length > 0 &&
            visit.membership_visit_phase !== "reporting" && (
            <Card data-testid="visit-checklist-panel">
              <SectionHeader title="Walkthrough Checklist" />
              <VisitChecklistForm
                visitId={visit.id}
                initialItems={checklistItems}
                canUpdate={canChecklist}
                propertyId={visit.job_property_id ?? null}
              />
            </Card>
          )}

          {/* ── Membership reporting phase + completed membership visits: visit snapshot ── */}
          {isMembershipVisit && !isRepairFlow &&
            (visit.membership_visit_phase === "reporting" || currentStatus === "completed") && (
            <Card data-testid="visit-snapshot-card">
              <SectionHeader title="Visit Summary" />
              <VisitSnapshotPanel
                visitId={visit.id}
                checklistItems={checklistItems}
                techNotes={visit.tech_notes ?? null}
                jobId={visit.job_id ?? null}
                clientId={visit.job_client_id ?? null}
                propertyId={visit.job_property_id ?? null}
                canCreateEstimate={canCreateEstimate}
                canUpdateDelivery={canNotes}
                visitDate={toISO(visit.scheduled_start)}
                snapshotSentAt={visit.membership_snapshot_sent_at ? toISO(visit.membership_snapshot_sent_at) : null}
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

          {currentStatus === "in_progress" && (
            <Card data-testid="completion-checklist-panel">
              <SectionHeader title="Completion Checklist" />
              <CompletionChecklist
                visitId={visit.id}
                initialPacket={completionPacket}
                canUpdate={canNotes}
                canComplete={canTransition}
              />
            </Card>
          )}

          {!showTransitionEarly && canTransition && currentStatus !== "completed" && currentStatus !== "cancelled" &&
            !(session.role === "tech" && currentStatus === "in_progress") && (
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
                isMembershipVisit={isMembershipVisit}
                membershipPhase={visit.membership_visit_phase ?? "health_check"}
                membershipSnapshotSentAt={
                  visit.membership_snapshot_sent_at ? toISO(visit.membership_snapshot_sent_at) : null
                }
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
              {session.role !== "tech" && (
                <div className="p7-detail-row">
                  <dt>Exception</dt>
                  <dd>
                    <SubStatusSelect
                      endpoint={`/api/v1/visits/${visit.id}/sub-status`}
                      initialValue={visit.sub_status}
                      options={VISIT_SUB_STATUSES.map((value) => ({
                        value,
                        label: SUB_STATUS_LABELS[value],
                      }))}
                    />
                  </dd>
                </div>
              )}
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
