import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { canCreateEstimates, canDeleteRecords } from "@/lib/auth/permissions";
import type { EstimateStatus, RoomSpec } from "@ai-fsm/domain";
import { manualEstimateTransitions } from "@/lib/estimates/transitions";
import { EstimateTransitionForm } from "./EstimateTransitionForm";
import { EstimateInternalNotesForm } from "./EstimateInternalNotesForm";
import { DeleteEstimateButton } from "./DeleteEstimateButton";
import { EstimateEditForm } from "./EstimateEditForm";
import { EstimateReviewPanel } from "./EstimateReviewPanel";
import { SendEstimateButton } from "./SendEstimateButton";
import { PageContainer, PageHeader, StatusBadge, StatusStepper } from "@/components/ui";
import type { StatusVariant } from "@/components/ui";
import { isEmailConfigured } from "@/lib/email/mailer";
import { CopyPortalLinkButton } from "@/components/CopyPortalLinkButton";
import { buildClientDocumentFilename } from "@/lib/estimates/guardrails";
import { ChangeOrdersClient } from "./ChangeOrdersClient";
import { loadEstimateDetail } from "./detail-data";
import { LinkedDocuments } from "@/components/documents/LinkedDocuments";
import { STATUS_LABELS } from "./format";
import { EstimateBanners } from "./sections/EstimateBanners";
import { EstimateSummaryCard } from "./sections/EstimateSummaryCard";
import { EstimateLineItems } from "./sections/EstimateLineItems";
import { ApprovedHandoff } from "./sections/ApprovedHandoff";

export const dynamic = "force-dynamic";

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const detail = await loadEstimateDetail(session, id);
  if (!detail) notFound();

  const { estimate, lineItems, options, jobVisitCount, depositInvoice, finalInvoice, changeOrders } = detail;

  const shoppingListSummary = estimate.shopping_list_json as { sections?: Array<{ section: string }> } | null | undefined;
  const hasMaterialsPlan = !!shoppingListSummary?.sections?.length;

  const currentStatus = estimate.status;
  // Manual transitions exclude `sent` — sending is the only path to sent status.
  const allowedTransitions = manualEstimateTransitions(currentStatus);
  const canTransition = canCreateEstimates(session.role);
  const canDelete = canDeleteRecords(session.role);
  const canEditInternalNotes = canCreateEstimates(session.role) && currentStatus === "sent";
  const documentFilename = buildClientDocumentFilename({
    date: estimate.sent_at ?? estimate.created_at,
    clientName: estimate.client_name,
    jobType: estimate.job_title ?? "Project",
    documentType: "estimate",
    status: estimate.status === "declined" || estimate.status === "expired" ? "archived" : estimate.status,
  });

  return (
    <PageContainer>
      <PageHeader
        backHref="/app/estimates"
        backLabel="Estimates"
        title={`${estimate.estimate_number ? `${estimate.estimate_number} — ` : "Estimate — "}${estimate.client_name ?? "Unknown client"}`}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
            <CopyPortalLinkButton url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/estimates/${estimate.share_token}`} />
            {/* One canonical PDF action; the /print view duplicated this artifact. */}
            <a
              href={`/api/v1/estimates/${estimate.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="estimate-download-pdf"
              style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              Download PDF →
            </a>
            <a href={`/app/estimates/${estimate.id}/shopping-list`} style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}>
              Shopping List →
            </a>
            <span data-testid="estimate-status">
              <StatusBadge variant={estimate.status as StatusVariant}>
                {STATUS_LABELS[currentStatus]}
              </StatusBadge>
            </span>
            {estimate.condition_tier === "yellow" && (
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 99,
                fontSize: "var(--text-xs)", fontWeight: 600,
                background: "color-mix(in srgb, var(--color-warning) 15%, transparent)",
                color: "var(--color-warning)",
                border: "1px solid color-mix(in srgb, var(--color-warning) 40%, transparent)",
              }}>
                Elevated Risk
              </span>
            )}
            {estimate.condition_tier === "red" && (
              <span style={{
                display: "inline-block", padding: "2px 8px", borderRadius: 99,
                fontSize: "var(--text-xs)", fontWeight: 600,
                background: "color-mix(in srgb, var(--color-danger) 15%, transparent)",
                color: "var(--color-danger)",
                border: "1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)",
              }}>
                Complex — Review
              </span>
            )}
          </div>
        }
      >
        {estimate.job_title && (
          <p className="p7-page-subtitle page-subtitle">
            Job:{" "}
            {estimate.job_id ? (
              <Link href={`/app/jobs/${estimate.job_id}`}>{estimate.job_title}</Link>
            ) : (
              estimate.job_title
            )}
          </p>
        )}
      </PageHeader>

      <EstimateBanners
        estimate={estimate}
        canTransition={canTransition}
        jobVisitCount={jobVisitCount}
        depositInvoice={depositInvoice}
        finalInvoice={finalInvoice}
      />

      {/* Status Stepper — main path only */}
      {(["draft", "sent", "approved"] as EstimateStatus[]).includes(currentStatus) && (
        <div className="card" style={{ marginBottom: "var(--space-4)" }}>
          <StatusStepper
            steps={[
              { key: "draft", label: "Draft" },
              { key: "sent", label: "Sent" },
              { key: "approved", label: "Approved" },
            ]}
            currentStep={currentStatus}
            data-testid="estimate-status-stepper"
          />
        </div>
      )}

      <EstimateSummaryCard
        estimate={estimate}
        role={session.role}
        documentFilename={documentFilename}
      />

      <EstimateLineItems
        estimate={estimate}
        lineItems={lineItems}
        options={options}
      />

      {/* Edit form — owner/admin only, draft only */}
      {canTransition && currentStatus === "draft" && (
        <EstimateEditForm
          estimateId={estimate.id}
          presentationMode={estimate.presentation_mode}
          initialClientId={estimate.client_id}
          initialJobId={estimate.job_id}
          initialPropertyId={estimate.property_id}
          initialNotes={estimate.notes}
          initialExpiresAt={estimate.expires_at}
          initialSubtotalCents={estimate.subtotal_cents}
          initialTaxCents={estimate.tax_cents}
          initialLineItems={lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price_cents: item.unit_price_cents,
            sort_order: item.sort_order,
          }))}
          initialOptions={options.map((opt) => ({
            id: opt.id,
            label: opt.label,
            description: opt.description ?? "",
            is_recommended: opt.is_recommended,
            sort_order: opt.sort_order,
            line_items: opt.line_items.map((li) => ({
              description: li.description,
              quantity: li.quantity,
              unit_price_cents: li.unit_price_cents,
            })),
          }))}
          initialSqFt={estimate.sq_ft}
          initialPrepLevel={estimate.prep_level}
          initialIncludesTrim={estimate.includes_trim}
          initialIncludesCeiling={estimate.includes_ceiling}
          initialMaterialCostCents={estimate.internal_material_cost_cents}
          initialLaborHours={estimate.internal_labor_cost_cents !== null && estimate.sq_ft !== null
            ? Math.round((estimate.internal_labor_cost_cents / 8500) * 10) / 10
            : null}
          initialTripCount={estimate.trip_count}
          initialRequiresDryingOrCuring={estimate.requires_drying_or_curing}
          initialDifficultAccess={estimate.difficult_access}
          initialOldHouseRisk={estimate.old_house_risk}
          initialCoordinationRequired={estimate.coordination_required}
          initialFinishExpectation={estimate.finish_expectation}
          initialTravelSurchargeCents={estimate.travel_surcharge_cents}
          initialRiskAdjustmentCents={estimate.risk_adjustment_cents}
          initialMinimumServiceOverrideReason={estimate.minimum_service_override_reason}
          initialMinimumServiceOverrideNote={estimate.minimum_service_override_note}
          initialRoomSpecs={estimate.room_specs ? (estimate.room_specs as RoomSpec[]) : null}
        />
      )}

      {/* Review panel */}
      {canTransition && !["declined", "expired"].includes(currentStatus) && (
        <EstimateReviewPanel estimateId={estimate.id} />
      )}

      {/* Send to Client — owner/admin only, non-terminal estimates */}
      {canTransition && !["approved", "declined", "expired"].includes(currentStatus) && (
        <div className="card action-card">
          <h2>Send to Client</h2>
          <SendEstimateButton
            estimateId={estimate.id}
            clientEmail={estimate.client_email}
            sentAt={estimate.sent_at}
            emailConfigured={isEmailConfigured()}
          />
        </div>
      )}

      {/* Status Transitions — owner/admin only */}
      {canTransition && allowedTransitions.length > 0 && (
        <div className="card action-card" data-testid="estimate-transition-panel">
          <h2>Transition Status</h2>
          <EstimateTransitionForm
            estimateId={estimate.id}
            allowedTransitions={allowedTransitions as EstimateStatus[]}
            statusLabels={STATUS_LABELS}
          />
        </div>
      )}

      {/* Internal Notes — owner/admin only, in sent state */}
      {canEditInternalNotes && (
        <div className="card" data-testid="internal-notes-panel">
          <h2>Internal Notes</h2>
          <EstimateInternalNotesForm estimateId={estimate.id} initialNotes={estimate.internal_notes} />
        </div>
      )}

      {/* Approved project handoff — owner/admin only */}
      {canTransition && currentStatus === "approved" && (
        <ApprovedHandoff estimate={estimate} jobVisitCount={jobVisitCount} hasMaterialsPlan={hasMaterialsPlan} />
      )}

      {/* Change orders — owner/admin only, approved estimates */}
      {canTransition && currentStatus === "approved" && (
        <ChangeOrdersClient estimateId={estimate.id} initialChangeOrders={changeOrders} />
      )}

      {/* Linked Paperless documents (contracts, signed approvals, reference docs) */}
      <LinkedDocuments session={session} entityType="estimate" entityId={estimate.id} />

      {/* Danger Zone — owner only, draft status only */}
      {canDelete && currentStatus === "draft" && (
        <div className="card danger-card" data-testid="danger-zone">
          <h2>Danger Zone</h2>
          <p className="muted">Delete this estimate permanently. Only available for draft estimates.</p>
          <DeleteEstimateButton estimateId={estimate.id} />
        </div>
      )}
    </PageContainer>
  );
}
