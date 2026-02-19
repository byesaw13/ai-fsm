import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  canCreateEstimates,
  canDeleteRecords,
} from "@/lib/auth/permissions";
import { withEstimateContext } from "@/lib/estimates/db";
import { estimateTransitions } from "@ai-fsm/domain";
import type { EstimateStatus } from "@ai-fsm/domain";
import { EstimateTransitionForm } from "./EstimateTransitionForm";
import { EstimateInternalNotesForm } from "./EstimateInternalNotesForm";
import { EstimateConvertButton } from "./EstimateConvertButton";
import { DeleteEstimateButton } from "./DeleteEstimateButton";

export const dynamic = "force-dynamic";

interface EstimateRow {
  id: string;
  account_id: string;
  client_id: string;
  job_id: string | null;
  property_id: string | null;
  status: EstimateStatus;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  internal_notes: string | null;
  sent_at: string | null;
  expires_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  job_title: string | null;
}

interface LineItemRow {
  id: string;
  estimate_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  created_at: string;
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
      `SELECT e.*, c.name AS client_name, j.title AS job_title
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [id, session.accountId]
    );

    if (estimateResult.rowCount === 0) return null;

    const lineItemsResult = await client.query(
      `SELECT id, estimate_id, description, quantity, unit_price_cents, total_cents, sort_order, created_at
       FROM estimate_line_items
       WHERE estimate_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [id]
    );

    return {
      estimate: estimateResult.rows[0] as EstimateRow,
      lineItems: lineItemsResult.rows as LineItemRow[],
    };
  });

  if (!result) notFound();

  const { estimate, lineItems } = result;
  const currentStatus = estimate.status;
  const allowedTransitions = estimateTransitions[currentStatus];
  const canTransition = canCreateEstimates(session.role);
  const canDelete = canDeleteRecords(session.role);
  const canEditInternalNotes =
    canCreateEstimates(session.role) && currentStatus === "sent";

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
        <span
          className={`status-pill status-${estimate.status}`}
          data-testid="estimate-status"
        >
          {STATUS_LABELS[currentStatus]}
        </span>
      </div>

      {/* Summary */}
      <div className="card detail-card">
        <h2>Summary</h2>
        <p>
          <strong>Total:</strong>{" "}
          <span data-testid="estimate-total">
            {formatDollars(estimate.total_cents)}
          </span>
        </p>
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
        {estimate.notes && (
          <p>
            <strong>Notes:</strong> {estimate.notes}
          </p>
        )}
        {estimate.internal_notes && session.role !== "tech" && (
          <p>
            <strong>Internal Notes:</strong> {estimate.internal_notes}
          </p>
        )}
      </div>

      {/* Line Items */}
      <div className="card">
        <h2>Line Items</h2>
        {lineItems.length === 0 ? (
          <p className="muted" data-testid="line-items-empty">
            No line items.
          </p>
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
