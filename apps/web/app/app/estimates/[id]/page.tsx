import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  canCreateEstimates,
  canDeleteRecords,
} from "@/lib/auth/permissions";
import { withEstimateContext } from "@/lib/estimates/db";
import { getPool } from "@/lib/db";
import { estimateTransitions, PREP_LEVEL_MULTIPLIERS } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";
import { EstimateTransitionForm } from "./EstimateTransitionForm";
import { EstimateInternalNotesForm } from "./EstimateInternalNotesForm";
import { EstimateConvertButton } from "./EstimateConvertButton";
import { DeleteEstimateButton } from "./DeleteEstimateButton";
import { EstimateEditForm } from "./EstimateEditForm";
import { EstimateReviewPanel } from "./EstimateReviewPanel";
import { SendEstimateButton } from "./SendEstimateButton";
import { StatusStepper } from "@/components/ui";
import { isEmailConfigured } from "@/lib/email/mailer";
import { CopyPortalLinkButton } from "@/components/CopyPortalLinkButton";
import { buildClientDocumentFilename } from "@/lib/estimates/guardrails";

import { ChangeOrdersClient } from "./ChangeOrdersClient";

export const dynamic = "force-dynamic";

interface EstimateRow {
  id: string;
  account_id: string;
  client_id: string;
  job_id: string | null;
  property_id: string | null;
  status: EstimateStatus;
  presentation_mode: "standard" | "multi_option";
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  notes: string | null;
  internal_notes: string | null;
  sent_at: string | null;
  expires_at: string | null;
  share_token: string;
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  internal_labor_cost_cents: number | null;
  internal_material_cost_cents: number | null;
  trip_count: "one_trip" | "multi_trip";
  requires_drying_or_curing: boolean;
  difficult_access: boolean;
  old_house_risk: boolean;
  coordination_required: boolean;
  finish_expectation: "basic" | "clean" | "premium";
  travel_surcharge_cents: number;
  risk_adjustment_cents: number;
  minimum_service_override_reason: "bundled" | "membership_included" | "promo" | "owner_approved" | null;
  minimum_service_override_note: string | null;
  pricing_review_status: "needs_review" | "passed" | "blocked";
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_email: string | null;
  job_title: string | null;
}

interface LineItemRow {
  id: string;
  estimate_id: string;
  option_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
}

interface OptionRow {
  id: string;
  estimate_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recommended: boolean;
  created_at: string;
}

interface ChangeOrderLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

interface ChangeOrder {
  id: string;
  title: string;
  description: string | null;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  declined_at: string | null;
  created_at: string;
  line_items: ChangeOrderLineItem[];
}

const STATUS_LABELS: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
  expired: "Expired",
};

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function EstimateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");

  const result = await withEstimateContext(session, async (client) => {
    const estimateResult = await client.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email, j.title AS job_title
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [id, session.accountId]
    );

    if (estimateResult.rowCount === 0) return null;

    const lineItemsResult = await client.query(
      `SELECT id, estimate_id, option_id, description, quantity, unit_price_cents, total_cents, sort_order, created_at
       FROM estimate_line_items
       WHERE estimate_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    const optionsResult = await client.query(
      `SELECT id, estimate_id, label, description, sort_order, subtotal_cents, tax_cents, total_cents, is_recommended, created_at
       FROM estimate_options
       WHERE estimate_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    const allLineItems = lineItemsResult.rows as LineItemRow[];
    const options = optionsResult.rows as OptionRow[];

    const optionsWithItems = options.map((opt) => ({
      ...opt,
      line_items: allLineItems.filter((li) => li.option_id === opt.id),
    }));

    return {
      estimate: estimateResult.rows[0] as EstimateRow,
      lineItems: allLineItems.filter((li) => !li.option_id),
      options: optionsWithItems,
    };
  });

  if (!result) notFound();

  const { estimate, lineItems, options } = result;

  // Fetch change orders for this estimate
  let changeOrders: unknown[] = [];
  try {
    const pool = getPool();
    const coRows = await pool.query<{
      id: string;
      title: string;
      description: string | null;
      status: string;
      subtotal_cents: number;
      tax_cents: number;
      total_cents: number;
      notes: string | null;
      approved_by_name: string | null;
      approved_at: string | null;
      declined_at: string | null;
      created_at: string;
    }>(
      `SELECT id, title, description, status, subtotal_cents, tax_cents, total_cents, notes,
              u2.full_name as approved_by_name,
              co.approved_at, co.declined_at, co.created_at
       FROM change_orders co
       LEFT JOIN users u2 ON u2.id = co.approved_by
       WHERE co.estimate_id = $1 AND co.account_id = $2
       ORDER BY co.created_at DESC`,
      [id, session.accountId]
    );
    changeOrders = coRows.rows;

    // Fetch line items for each change order
    for (const co of changeOrders) {
      const items = await pool.query(
        `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
         FROM change_order_line_items
         WHERE change_order_id = $1
         ORDER BY sort_order ASC`,
        [(co as { id: string }).id]
      );
      (co as Record<string, unknown>).line_items = items.rows;
    }
  } catch {
    // Change orders table may not exist yet
  }

  const currentStatus = estimate.status;
  const allowedTransitions = estimateTransitions[currentStatus];
  const canTransition = canCreateEstimates(session.role);
  const canDelete = canDeleteRecords(session.role);
  const canEditInternalNotes =
    canCreateEstimates(session.role) && currentStatus === "sent";
  const documentFilename = buildClientDocumentFilename({
    date: estimate.sent_at ?? estimate.created_at,
    clientName: estimate.client_name,
    jobType: estimate.job_title ?? "Job",
    documentType: "estimate",
    status: estimate.status === "declined" || estimate.status === "expired" ? "archived" : estimate.status,
  });

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href="/app/estimates" className="back-link">
            ← Estimates
          </Link>
          <h1 className="page-title">
            Estimate — {estimate.client_name ?? "Unknown client"}
          </h1>
          {estimate.job_title && (
            <p className="page-subtitle">Job: {estimate.job_title}</p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <CopyPortalLinkButton
            url={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/estimates/${estimate.share_token}`}
          />
          <Link
            href={`/app/estimates/${estimate.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}
            data-testid="estimate-print-link"
          >
            Print / PDF →
          </Link>
          <span
            className={`status-pill status-${estimate.status}`}
            data-testid="estimate-status"
          >
            {STATUS_LABELS[currentStatus]}
          </span>
        </div>
      </div>

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

      {/* Summary */}
      <div className="card detail-card">
        <h2>Summary</h2>
        <p>
          <strong>Total:</strong>{" "}
          <span data-testid="estimate-total">
            {formatDollars(estimate.total_cents)}
          </span>
        </p>
        {estimate.deposit_cents > 0 && (
          <p>
            <strong>Deposit (30%):</strong> {formatDollars(estimate.deposit_cents)}
          </p>
        )}
        {estimate.balance_cents > 0 && (
          <p>
            <strong>Balance (70%):</strong> {formatDollars(estimate.balance_cents)}
          </p>
        )}
        {estimate.sent_at && (
          <p>
            <strong>Sent:</strong>{" "}
            {new Date(estimate.sent_at).toLocaleDateString()}
          </p>
        )}
        {estimate.expires_at && (
          <p>
            <strong>Expires:</strong>{" "}
            {new Date(estimate.expires_at).toLocaleDateString()}
          </p>
        )}
        {(session.role === "owner" || session.role === "admin") && (
          <p>
            <strong>Document Filename:</strong>{" "}
            <code>{documentFilename}</code>
          </p>
        )}
        {estimate.notes && (
          <p>
            <strong>Notes:</strong> {estimate.notes}
          </p>
        )}

        {/* Painting scope details */}
        {estimate.sq_ft !== null && (
          <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-1)" }}>Painting Scope</p>
            <p><strong>Square footage:</strong> {Number(estimate.sq_ft).toLocaleString()} sq ft</p>
            {estimate.prep_level !== null && (
              <p><strong>Prep level:</strong> {estimate.prep_level} ({PREP_LEVEL_MULTIPLIERS[estimate.prep_level]?.toFixed(2)}x multiplier)</p>
            )}
            <p><strong>Trim:</strong> {estimate.includes_trim ? "Included" : "Not included"}</p>
            <p><strong>Ceiling:</strong> {estimate.includes_ceiling ? "Included (+30% surface)" : "Not included"}</p>
          </div>
        )}

        {/* Internal margin (owner/admin only) */}
        {(session.role === "owner" || session.role === "admin") && estimate.internal_labor_cost_cents !== null && estimate.sq_ft !== null && (
          <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-1)", color: "var(--fg-muted)" }}>Internal Margin</p>
            {(() => {
              // Recompute gross margin from stored data
              const laborRevenue = estimate.subtotal_cents - (estimate.internal_material_cost_cents ?? 0) - Math.round((estimate.internal_material_cost_cents ?? 0) * 0.15);
              const internalCost = estimate.internal_labor_cost_cents;
              const marginCents = laborRevenue - internalCost;
              const marginPct = laborRevenue > 0 ? Math.round((marginCents / laborRevenue) * 100 * 10) / 10 : 0;
              const marginColor = marginPct >= 30 ? "var(--color-success)" : marginPct >= 15 ? "var(--color-warning)" : "var(--color-danger)";
              return (
                <>
                  <p><strong>Internal labor cost:</strong> {formatDollars(estimate.internal_labor_cost_cents)}</p>
                  <p><strong>Labor revenue:</strong> {formatDollars(laborRevenue)}</p>
                  <p>
                    <strong>Gross margin:</strong>{" "}
                    <span style={{ color: marginColor, fontWeight: 700 }}>
                      {marginPct}% ({formatDollars(marginCents)})
                    </span>
                  </p>
                </>
              );
            })()}
          </div>
        )}

        {estimate.internal_notes && session.role !== "tech" && (
          <p>
            <strong>Internal Notes:</strong> {estimate.internal_notes}
          </p>
        )}

        {(session.role === "owner" || session.role === "admin") && (
          <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
            <p style={{ fontWeight: 600, marginBottom: "var(--space-1)", color: "var(--fg-muted)" }}>Pricing Guardrails</p>
            <p><strong>Review:</strong> {estimate.pricing_review_status.replace(/_/g, " ")}</p>
            <p><strong>Trips:</strong> {estimate.trip_count === "multi_trip" ? "Multi-trip" : "One trip"}</p>
            <p><strong>Finish:</strong> {estimate.finish_expectation}</p>
            {(estimate.travel_surcharge_cents > 0 || estimate.risk_adjustment_cents > 0) && (
              <p>
                <strong>Adjustments:</strong>{" "}
                {formatDollars(estimate.travel_surcharge_cents + estimate.risk_adjustment_cents)}
              </p>
            )}
            {estimate.minimum_service_override_reason && (
              <p><strong>Minimum override:</strong> {estimate.minimum_service_override_reason.replace(/_/g, " ")}</p>
            )}
          </div>
        )}
      </div>

      {/* Line Items (or flat rate summary) */}
      {estimate.presentation_mode === "multi_option" && options.length > 0 ? (
        <div>
          <div className="card">
            <h2>Options</h2>
            <p className="muted">Compare options and choose the one that best fits your needs.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: "var(--space-4)" }}>
            {options.map((option) => (
              <div
                key={option.id}
                className="card"
                style={{
                  border: option.is_recommended ? "2px solid var(--accent)" : "1px solid var(--border)",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {option.is_recommended && (
                  <div style={{
                    position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    background: "var(--accent)", color: "#fff", padding: "2px 12px", borderRadius: 99,
                    fontSize: "var(--text-xs)", fontWeight: 600, whiteSpace: "nowrap", zIndex: 1,
                  }}>
                    Recommended
                  </div>
                )}
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <h2 style={{ margin: "0 0 var(--space-1)" }}>{option.label}</h2>
                  {option.description && (
                    <p className="muted" style={{ margin: 0, fontSize: "var(--text-sm)" }}>{option.description}</p>
                  )}
                </div>

                <table className="line-items-table" style={{ flex: 1 }}>
                  <tbody>
                    {option.line_items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>{formatDollars(item.unit_price_cents)}</td>
                        <td>{formatDollars(item.total_cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)", marginTop: "var(--space-3)" }}>
                  {option.tax_cents > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                      <span>Tax</span>
                      <span>{formatDollars(option.tax_cents)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "var(--space-1)" }}>
                    <strong>Total</strong>
                    <strong>{formatDollars(option.total_cents)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
      <div className="card">
        <h2>Line Items</h2>
        {lineItems.length === 0 && estimate.subtotal_cents === 0 ? (
          <p className="muted" data-testid="line-items-empty">
            No line items.
          </p>
        ) : lineItems.length === 0 ? (
          /* Flat-rate estimate — no breakdown rows */
          <table className="line-items-table" data-testid="line-items-table">
            <tbody>
              <tr data-testid="line-item-row">
                <td>Flat rate</td>
                <td colSpan={2}></td>
                <td>{formatDollars(estimate.subtotal_cents)}</td>
              </tr>
            </tbody>
            <tfoot>
              {estimate.tax_cents > 0 && (
                <tr>
                  <td colSpan={2}></td>
                  <td className="subtotal-label">Tax</td>
                  <td>{formatDollars(estimate.tax_cents)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2}></td>
                <td className="subtotal-label"><strong>Total</strong></td>
                <td>
                  <strong data-testid="estimate-total-footer">
                    {formatDollars(estimate.total_cents)}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="line-items-table" data-testid="line-items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120 }}>Unit Price</th>
                <th style={{ width: 100 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item: LineItemRow) => (
                <tr key={item.id} data-testid="line-item-row">
                  <td>{item.description}</td>
                  <td>{item.quantity}</td>
                  <td>{formatDollars(item.unit_price_cents)}</td>
                  <td>{formatDollars(item.total_cents)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}></td>
                <td className="subtotal-label">
                  <strong>Subtotal</strong>
                </td>
                <td data-testid="estimate-subtotal">
                  {formatDollars(estimate.subtotal_cents)}
                </td>
              </tr>
              {estimate.tax_cents > 0 && (
                <tr>
                  <td colSpan={2}></td>
                  <td className="subtotal-label">Tax</td>
                  <td>{formatDollars(estimate.tax_cents)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={2}></td>
                <td className="subtotal-label">
                  <strong>Total</strong>
                </td>
                <td>
                  <strong data-testid="estimate-total-footer">
                    {formatDollars(estimate.total_cents)}
                  </strong>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      )}

      {/* Edit form — owner/admin only, draft only */}
      {canTransition && currentStatus === "draft" && (
        <EstimateEditForm
          estimateId={estimate.id}
          initialClientId={estimate.client_id}
          initialJobId={estimate.job_id}
          initialPropertyId={estimate.property_id}
          initialNotes={estimate.notes}
          initialExpiresAt={estimate.expires_at}
          initialSubtotalCents={estimate.subtotal_cents}
          initialTaxCents={estimate.tax_cents}
          initialLineItems={lineItems.map(item => ({
            description: item.description,
            quantity: item.quantity,
            unit_price_cents: item.unit_price_cents,
            sort_order: item.sort_order,
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
        />
      )}

      {/* Review — owner/admin only, active estimates */}
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
        <div
          className="card action-card"
          data-testid="estimate-transition-panel"
        >
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
          <EstimateInternalNotesForm
            estimateId={estimate.id}
            initialNotes={estimate.internal_notes}
          />
        </div>
      )}

      {/* Change Orders — owner/admin only, approved estimates */}
      {canTransition && currentStatus === "approved" && (
        <ChangeOrdersClient
          estimateId={estimate.id}
          initialChangeOrders={changeOrders as ChangeOrder[]}
        />
      )}

      {/* Convert to Invoice — owner/admin only, approved status only */}
      {canTransition && currentStatus === "approved" && (
        <div className="card action-card" data-testid="convert-panel-wrapper">
          <h2>Convert to Invoice</h2>
          <p className="muted">
            Create a draft invoice from this approved estimate. Idempotent —
            safe to click more than once.
          </p>
          <EstimateConvertButton estimateId={estimate.id} />
        </div>
      )}

      {/* Danger Zone — owner only, draft status only */}
      {canDelete && currentStatus === "draft" && (
        <div className="card danger-card" data-testid="danger-zone">
          <h2>Danger Zone</h2>
          <p className="muted">
            Delete this estimate permanently. Only available for draft
            estimates.
          </p>
          <DeleteEstimateButton estimateId={estimate.id} />
        </div>
      )}
    </div>
  );
}
