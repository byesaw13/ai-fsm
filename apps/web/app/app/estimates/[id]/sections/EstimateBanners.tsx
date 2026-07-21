import Link from "next/link";
import { CreateJobFromEstimateButton } from "../CreateJobFromEstimateButton";
import { EstimateConvertButton } from "../EstimateConvertButton";
import { formatDollars } from "../format";
import type { EstimateRow, EstimateInvoiceRow } from "../detail-data";

interface Props {
  estimate: EstimateRow;
  canTransition: boolean;
  jobVisitCount: number;
  depositInvoice: EstimateInvoiceRow | null;
  finalInvoice: EstimateInvoiceRow | null;
}

/** Approved next-steps banner (with billing summary) and expired recovery banner. */
export function EstimateBanners({
  estimate,
  canTransition,
  jobVisitCount,
  depositInvoice,
  finalInvoice,
}: Props) {
  const currentStatus = estimate.status;
  // Convert to final invoice whenever no final exists yet. Project closeout also
  // auto-creates a final invoice, but owners need a direct path for standalone
  // estimates and for smoke/billing flows that bill before field closeout.
  const canConvertToFinal = !finalInvoice;

  return (
    <>
      {/* Approved next-steps banner */}
      {currentStatus === "approved" && canTransition && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-4)", border: "1px solid #10b981", background: "#f0fdf4" }}
          data-testid="approved-banner"
        >
          <p style={{ margin: 0, fontWeight: 600, color: "#065f46" }}>
            Estimate approved — ready to schedule work or invoice.
          </p>
          <div
            style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)", flexWrap: "wrap", alignItems: "center" }}
            data-testid="convert-panel-wrapper"
          >
            {estimate.job_id && jobVisitCount === 0 && (
              <Link
                href={`/app/jobs/${estimate.job_id}/visits/new`}
                style={{
                  padding: "var(--space-2) var(--space-4)", background: "#059669", color: "#fff",
                  borderRadius: "var(--radius)", fontSize: "var(--text-sm)", fontWeight: 600,
                  textDecoration: "none", whiteSpace: "nowrap",
                }}
                data-testid="schedule-first-visit-btn"
              >
                Schedule First Visit →
              </Link>
            )}
            {estimate.job_id && jobVisitCount > 0 && (
              <Link href={`/app/jobs/${estimate.job_id}`} style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
                Go to job / manage visits →
              </Link>
            )}
            {!estimate.job_id && <CreateJobFromEstimateButton estimateId={estimate.id} />}
            {canConvertToFinal && <EstimateConvertButton estimateId={estimate.id} />}
            {finalInvoice && (
              <Link
                href={`/app/invoices/${finalInvoice.id}`}
                className="p7-btn p7-btn-primary p7-btn-sm"
                data-testid="final-invoice-link"
              >
                Open Final Invoice →
              </Link>
            )}
            <a href="#materials-plan-handoff" style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>
              Project handoff ↓
            </a>
          </div>

          {/* Billing summary — makes deposit vs final handling explicit */}
          {(depositInvoice || finalInvoice) && (
            <div
              style={{
                marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid #bbf7d0",
                display: "flex", gap: "var(--space-4)", flexWrap: "wrap", fontSize: "var(--text-sm)",
              }}
              data-testid="estimate-billing-summary"
            >
              {depositInvoice && (
                <Link href={`/app/invoices/${depositInvoice.id}`} style={{ color: "#065f46", textDecoration: "none" }} data-testid="deposit-invoice-link">
                  <strong>Deposit invoice</strong> {depositInvoice.invoice_number} ·{" "}
                  {formatDollars(depositInvoice.total_cents)} · {depositInvoice.status} →
                </Link>
              )}
              {finalInvoice ? (
                <Link href={`/app/invoices/${finalInvoice.id}`} style={{ color: "#065f46", textDecoration: "none" }} data-testid="final-invoice-link">
                  <strong>Final invoice</strong> {finalInvoice.invoice_number} · balance{" "}
                  {formatDollars(finalInvoice.balance_cents)} · {finalInvoice.status} →
                </Link>
              ) : (
                <span style={{ color: "#065f46", opacity: 0.8 }}>
                  {depositInvoice
                    ? "Final invoice not yet created — it will credit the deposit above."
                    : "No invoice yet — create the final invoice when work is ready to bill."}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expired recovery banner */}
      {currentStatus === "expired" && (
        <div
          className="card"
          style={{ marginBottom: "var(--space-4)", border: "1px solid #f59e0b", background: "#fffbeb" }}
          data-testid="expired-banner"
        >
          <p style={{ margin: 0, fontWeight: 600, color: "#92400e" }}>
            This estimate expired
            {estimate.expires_at ? ` on ${new Date(estimate.expires_at).toLocaleDateString()}` : ""}.
          </p>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "#78350f" }}>
            To re-engage this client, go to the job and create a new estimate.
          </p>
          {estimate.job_id && (
            <Link
              href={`/app/jobs/${estimate.job_id}`}
              style={{ display: "inline-block", marginTop: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}
            >
              Go to job →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
