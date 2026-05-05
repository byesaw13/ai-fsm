import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { queryOne, query } from "@/lib/db";
import { formatVisitTime, isVisitOverdue } from "@/lib/visits/p7";
import {
  canCreateInvoices,
  canTransitionJob,
  canCreateVisit,
  canDeleteRecords,
} from "@/lib/auth/permissions";
import { jobTransitions } from "@ai-fsm/domain";
import type { Job, Visit, JobStatus, JobAcceptanceCategory, JobIntakeDecision, JobIntakeRatingField } from "@ai-fsm/domain";
import { JOB_INTAKE_RATING_FIELDS } from "@ai-fsm/domain";
import { JobTransitionForm } from "./JobTransitionForm";
import { DeleteJobButton } from "./DeleteJobButton";
import { JobEditForm } from "./JobEditFormWrapper";
import { JobIntakePanel } from "./JobIntakePanel";
import { AssetLinksPanel } from "./AssetLinksPanel";
import { isHomeboxEnabled } from "@/lib/homebox/client";
import { withAssetContext, listAssetLinks } from "@/lib/homebox/db";
import {
  PageContainer,
  PageHeader,
  StatusBadge,
  StatusStepper,
  LinkButton,
  Timeline,
  Card,
  SectionHeader,
  EmptyState,
} from "@/components/ui";
import type { TimelineEntryData, StatusVariant } from "@/components/ui";

export const dynamic = "force-dynamic";

type JobRow = Job & {
  client_name: string | null;
  job_category: JobAcceptanceCategory | null;
  strategy_fit: number | null;
  scope_clarity: number | null;
  margin_confidence: number | null;
  schedule_impact: number | null;
  quality_fit: number | null;
  intake_decision: JobIntakeDecision | null;
  intake_notes: string | null;
};
type VisitRow = Visit & {
  assigned_user_name: string | null;
};

const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  quoted: "Quoted",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  invoiced: "Invoiced",
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

  const homeboxEnabled = isHomeboxEnabled();

  const [visits, commercialCounts, assetLinks] = await Promise.all([
    session.role === "tech"
      ? query<VisitRow>(
          `SELECT v.*, u.full_name AS assigned_user_name
           FROM visits v
           LEFT JOIN users u ON u.id = v.assigned_user_id
           WHERE v.job_id = $1 AND v.account_id = $2 AND v.assigned_user_id = $3
           ORDER BY v.scheduled_start ASC`,
          [id, session.accountId, session.userId]
        )
      : query<VisitRow>(
          `SELECT v.*, u.full_name AS assigned_user_name
           FROM visits v
           LEFT JOIN users u ON u.id = v.assigned_user_id
           WHERE v.job_id = $1 AND v.account_id = $2
           ORDER BY v.scheduled_start ASC`,
          [id, session.accountId]
        ),
    // Count estimates and invoices + profitability snapshot (owner/admin only)
    session.role !== "tech"
      ? queryOne<{
          estimate_count: string;
          invoice_count: string;
          actual_cost_cents: number | null;
          travel_miles: number | null;
          estimated_labor_cost_cents: number | null;
          estimated_total_cents: number | null;
          invoice_total_cents: number | null;
        }>(
          `SELECT
             (SELECT COUNT(*) FROM estimates WHERE job_id = $1 AND account_id = $2) AS estimate_count,
             (SELECT COUNT(*) FROM invoices  WHERE job_id = $1 AND account_id = $2) AS invoice_count,
             j.actual_cost_cents,
             j.travel_miles,
             (SELECT internal_labor_cost_cents FROM estimates
              WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
              ORDER BY created_at DESC LIMIT 1) AS estimated_labor_cost_cents,
             (SELECT total_cents FROM estimates
              WHERE job_id = $1 AND account_id = $2 AND status = 'approved'
              ORDER BY created_at DESC LIMIT 1) AS estimated_total_cents,
             (SELECT total_cents FROM invoices
              WHERE job_id = $1 AND account_id = $2 AND status != 'void'
              ORDER BY created_at DESC LIMIT 1) AS invoice_total_cents
           FROM jobs j WHERE j.id = $1 AND j.account_id = $2`,
          [id, session.accountId]
        )
      : Promise.resolve(null),
    withAssetContext(session, (client) =>
      listAssetLinks(client, session.accountId, "job", id)
    ).catch(() => []),
  ]);

  const currentStatus = job.status as JobStatus;
  const allowedTransitions = jobTransitions[currentStatus];
  const canTransition = canTransitionJob(session.role);
  const canAddVisit = canCreateVisit(session.role);
  const canDelete = canDeleteRecords(session.role);
  const canCreateInvoice = canCreateInvoices(session.role);
  const isTech = session.role === "tech";

  const estimateCount = commercialCounts ? parseInt(commercialCounts.estimate_count) : 0;
  const invoiceCount = commercialCounts ? parseInt(commercialCounts.invoice_count) : 0;

  // Profitability (owner/admin only)
  const revenueCents = commercialCounts?.invoice_total_cents ?? commercialCounts?.estimated_total_cents ?? null;
  const costCents = commercialCounts?.actual_cost_cents ?? commercialCounts?.estimated_labor_cost_cents ?? null;
  const grossMarginCents = revenueCents !== null && costCents !== null ? revenueCents - costCents : null;
  const grossMarginPct =
    grossMarginCents !== null && revenueCents !== null && revenueCents > 0
      ? Math.round((grossMarginCents / revenueCents) * 1000) / 10
      : null;
  const hasActualCost = (commercialCounts?.actual_cost_cents ?? null) !== null;

  // Build timeline entries from visits
  const timelineEntries: TimelineEntryData[] = visits.map((v) => {
    const overdue = isVisitOverdue(v);
    return {
      id: v.id,
      timestamp: v.scheduled_start,
      title: `${new Date(v.scheduled_start).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      })} · ${formatVisitTime(v.scheduled_start)}`,
      subtitle: v.assigned_user_name ? `Tech: ${v.assigned_user_name}` : "Unassigned",
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

  const scheduleVisitAction = canAddVisit ? (
    <LinkButton
      href={`/app/jobs/${job.id}/visits/new`}
      variant="secondary"
      size="sm"
      data-testid="add-visit-btn"
    >
      + Schedule Visit
    </LinkButton>
  ) : undefined;

  return (
    <PageContainer>
      <PageHeader
        title={job.title}
        subtitle={job.client_name ?? undefined}
        backHref="/app/jobs"
        backLabel="Jobs"
        actions={
          <span data-testid="job-status">
            <StatusBadge variant={currentStatus as StatusVariant}>
              {JOB_STATUS_LABELS[currentStatus]}
            </StatusBadge>
          </span>
        }
      />

      {/* Pipeline progress stepper — admin/owner only */}
      {!isTech && (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <StatusStepper
            steps={[
              { key: "draft", label: "Draft" },
              { key: "quoted", label: "Quoted" },
              { key: "scheduled", label: "Scheduled" },
              { key: "in_progress", label: "In Progress" },
              { key: "completed", label: "Completed" },
              { key: "invoiced", label: "Invoiced" },
            ]}
            currentStep={currentStatus}
            data-testid="job-status-stepper"
          />
        </Card>
      )}

      {/* Detail Hub Layout: two-column on desktop, stacked on mobile */}
      <div className="p7-detail-layout">
        {/* LEFT: Visits Timeline + Danger Zone */}
        <div className="p7-detail-primary">
          <Card>
            <SectionHeader
              title="Visits"
              count={visits.length}
              action={scheduleVisitAction}
            />
            {visits.length === 0 ? (
              <EmptyState
                title="No visits scheduled yet"
                description={
                  canAddVisit
                    ? "Use the button above to schedule the first visit."
                    : "No visits have been scheduled for this job."
                }
                data-testid="visits-empty"
              />
            ) : (
              <Timeline entries={timelineEntries} />
            )}
          </Card>

          {/* Status Transitions — admin/owner only */}
          {canTransition && allowedTransitions.length > 0 && (
            <Card data-testid="job-transition-panel">
              <SectionHeader title="Status Actions" />
              <JobTransitionForm
                jobId={job.id}
                allowedTransitions={allowedTransitions as JobStatus[]}
                statusLabels={JOB_STATUS_LABELS}
              />
            </Card>
          )}

          {/* Danger Zone — owner only, draft only */}
          {canDelete && currentStatus === "draft" && (
            <Card className="p7-card-danger" data-testid="danger-zone">
              <SectionHeader title="Danger Zone" />
              <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
                Delete this job permanently. Only available for draft jobs.
              </p>
              <DeleteJobButton jobId={job.id} />
            </Card>
          )}
        </div>

        {/* RIGHT: Job details + Commercial panel */}
        {!isTech && (
          <div className="p7-detail-sidebar">
            {/* Job details */}
            <Card>
              <SectionHeader title="Job Details" />
              <dl className="p7-detail-list">
                <div className="p7-detail-row">
                  <dt>Status</dt>
                  <dd>
                    <StatusBadge variant={currentStatus as StatusVariant}>
                      {JOB_STATUS_LABELS[currentStatus]}
                    </StatusBadge>
                  </dd>
                </div>
                {job.description && (
                  <div className="p7-detail-row">
                    <dt>Description</dt>
                    <dd style={{ whiteSpace: "pre-wrap" }}>{job.description}</dd>
                  </div>
                )}
                {job.scheduled_start && (
                  <div className="p7-detail-row">
                    <dt>Starts</dt>
                    <dd>{new Date(job.scheduled_start).toLocaleString()}</dd>
                  </div>
                )}
                {job.scheduled_end && (
                  <div className="p7-detail-row">
                    <dt>Ends</dt>
                    <dd>{new Date(job.scheduled_end).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </Card>

            {/* Edit form — admin/owner only */}
            <JobEditForm
              jobId={job.id}
              initialTitle={job.title}
              initialClientId={job.client_id ?? null}
              initialPropertyId={job.property_id ?? null}
              initialDescription={job.description ?? null}
              initialPriority={job.priority ?? 0}
              initialScheduledStart={job.scheduled_start ?? null}
              initialScheduledEnd={job.scheduled_end ?? null}
              initialActualCostCents={job.actual_cost_cents ?? null}
              initialTravelMiles={job.travel_miles ?? null}
            />

            {/* Intake panel — admin/owner only */}
            <Card data-testid="job-intake-card">
              <SectionHeader title="Job Intake" />
              <JobIntakePanel
                jobId={job.id}
                initialCategory={job.job_category}
                initialRatings={Object.fromEntries(
                  JOB_INTAKE_RATING_FIELDS.map((f) => [f, (job as Record<string, unknown>)[f] as number | null])
                ) as Record<JobIntakeRatingField, number | null>}
                initialDecision={job.intake_decision}
                initialNotes={job.intake_notes ?? null}
              />
            </Card>

            {/* Commercial links */}
            <Card>
              <SectionHeader
                title="Commercial"
                action={
                  <LinkButton
                    href={`/app/estimates/new?job_id=${job.id}&client_id=${job.client_id ?? ""}`}
                    variant="secondary"
                    size="sm"
                    data-testid="new-estimate-btn"
                  >
                    + New Estimate
                  </LinkButton>
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
                    ) : canCreateInvoice && ["completed", "in_progress"].includes(currentStatus) ? (
                      <LinkButton
                        href={`/app/invoices/new?job_id=${job.id}${job.client_id ? `&client_id=${job.client_id}` : ""}`}
                        variant="primary"
                        size="sm"
                        data-testid="create-invoice-from-job-btn"
                      >
                        + Create Invoice
                      </LinkButton>
                    ) : (
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>None</span>
                    )}
                  </dd>
                </div>
              </dl>
            </Card>

            {/* Profitability (owner/admin only) */}
            {!isTech && revenueCents !== null && (
              <Card data-testid="profitability-card">
                <SectionHeader title="Profitability" />
                <dl className="p7-detail-list">
                  <div className="p7-detail-row">
                    <dt>Revenue</dt>
                    <dd>${((revenueCents) / 100).toFixed(2)}</dd>
                  </div>
                  {costCents !== null && (
                    <div className="p7-detail-row">
                      <dt>{hasActualCost ? "Actual Cost" : "Est. Labor Cost"}</dt>
                      <dd>${(costCents / 100).toFixed(2)}</dd>
                    </div>
                  )}
                  {grossMarginCents !== null && (
                    <div className="p7-detail-row">
                      <dt>Gross Margin</dt>
                      <dd
                        style={{ color: grossMarginCents >= 0 ? "var(--color-success, green)" : "var(--color-error, red)" }}
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
                  {!hasActualCost && (
                    <div className="p7-detail-row">
                      <dt></dt>
                      <dd style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                        Based on estimate — update with actual after completion
                      </dd>
                    </div>
                  )}
                </dl>
              </Card>
            )}

            {/* Asset links (Homebox) */}
            <AssetLinksPanel
              entityType="job"
              entityId={job.id}
              initialLinks={assetLinks}
              homeboxEnabled={homeboxEnabled}
              canLink={!isTech}
            />
          </div>
        )}

        {/* Tech view: show job info inline below timeline */}
        {isTech && (
          <div className="p7-detail-sidebar">
            <Card>
              <SectionHeader title="Job Details" />
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
                {job.scheduled_start && (
                  <div className="p7-detail-row">
                    <dt>Starts</dt>
                    <dd>{new Date(job.scheduled_start).toLocaleString()}</dd>
                  </div>
                )}
              </dl>
            </Card>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
