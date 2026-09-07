import Link from "next/link";
import { formatCents } from "@ai-fsm/money";
import { CreateJobFromEstimateButton } from "../CreateJobFromEstimateButton";
import { EstimateConvertButton } from "../EstimateConvertButton";
import { CollectDepositButton } from "../../../jobs/[id]/CollectDepositButton";
import { MarkDepositReceivedButton } from "../../../invoices/[id]/MarkDepositReceivedButton";
import type { EstimateInvoiceRow, EstimateRow } from "../detail-data";

interface Props {
  estimate: EstimateRow;
  jobVisitCount: number;
  hasMaterialsPlan: boolean;
  jobStatus: string | null;
  depositInvoice: EstimateInvoiceRow | null;
  finalInvoice: EstimateInvoiceRow | null;
}

/** Approved-estimate handoff: materials → schedule → owner closeout → final billing. */
export function ApprovedHandoff({
  estimate,
  jobVisitCount,
  hasMaterialsPlan,
  jobStatus,
  depositInvoice,
  finalInvoice,
}: Props) {
  const projectClosed =
    jobStatus === "completed" || jobStatus === "invoiced";
  const depositPaid =
    depositInvoice != null &&
    (depositInvoice.status === "paid" || depositInvoice.status === "partial");

  return (
    <div id="materials-plan-handoff" className="card action-card" data-testid="approved-project-handoff">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        <div>
          <h2 style={{ marginBottom: "var(--space-1)" }}>Approved Project Handoff</h2>
          <p className="muted" style={{ margin: 0 }}>
            Materials and multi-day work stay on the project. Final billing waits until you explicitly complete the project.
          </p>
        </div>
        <span style={{ alignSelf: "flex-start", fontSize: "var(--text-xs)", fontWeight: 700, color: "#065f46", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 999, padding: "4px 10px" }}>
          Approved
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)" }}>
          <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>1. Materials</p>
          <p className="muted" style={{ minHeight: 42 }}>
            {hasMaterialsPlan
              ? "Review, print, and shop from the approved materials plan."
              : "Prepare the buying list from approved scope before work starts."}
          </p>
          <Link href={`/app/estimates/${estimate.id}/shopping-list`} className="p7-btn p7-btn-secondary p7-btn-sm">
            {hasMaterialsPlan ? "Open Materials Plan →" : "Prepare Materials Plan →"}
          </Link>
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)" }} data-testid="handoff-deposit-step">
          <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>2. Deposit</p>
          {(() => {
            const depositAmountCents =
              depositInvoice?.total_cents ?? (estimate.deposit_cents > 0 ? estimate.deposit_cents : null);
            if (!estimate.job_id) {
              return (
                <p className="muted" style={{ minHeight: 42 }}>
                  Link this estimate to a project to collect a deposit.
                </p>
              );
            }
            if (depositPaid) {
              return (
                <p className="muted" style={{ minHeight: 42 }}>
                  ✓ Deposit received{depositAmountCents != null ? ` — ${formatCents(depositAmountCents)}` : ""}.
                </p>
              );
            }
            if (depositInvoice) {
              return (
                <>
                  <p className="muted" style={{ minHeight: 42 }}>
                    Deposit invoice {depositInvoice.invoice_number}
                    {depositAmountCents != null ? ` (${formatCents(depositAmountCents)})` : ""} —{" "}
                    {depositInvoice.status === "draft"
                      ? "send it, then mark it received before work starts."
                      : "waiting on payment; mark it received when it lands."}
                  </p>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <Link href={`/app/invoices/${depositInvoice.id}`} className="p7-btn p7-btn-primary p7-btn-sm">
                      {depositInvoice.status === "draft" ? "Send Deposit →" : "Open Deposit →"}
                    </Link>
                    {depositInvoice.status !== "draft" && depositAmountCents != null && (
                      <MarkDepositReceivedButton invoiceId={depositInvoice.id} depositCents={depositAmountCents} />
                    )}
                  </div>
                </>
              );
            }
            return (
              <>
                <p className="muted" style={{ minHeight: 42 }}>
                  Collect a deposit before work starts. Defaults to this estimate&apos;s deposit, or your
                  standard deposit % from Settings.
                </p>
                <CollectDepositButton jobId={estimate.job_id} />
              </>
            );
          })()}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)" }}>
          <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>3. Schedule &amp; work</p>
          <p className="muted" style={{ minHeight: 42 }}>
            {estimate.job_id
              ? jobVisitCount > 0
                ? "Work days live on the project. Schedule the next day anytime — visits do not close the project."
                : "Schedule the first work day from the project."
              : "Link this estimate to a project before scheduling work."}
          </p>
          {estimate.job_id ? (
            <Link
              href={jobVisitCount > 0 ? `/app/jobs/${estimate.job_id}` : `/app/jobs/${estimate.job_id}/visits/new`}
              className="p7-btn p7-btn-primary p7-btn-sm"
            >
              {jobVisitCount > 0 ? "Open Project →" : "Schedule Work →"}
            </Link>
          ) : (
            <CreateJobFromEstimateButton estimateId={estimate.id} />
          )}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)" }}>
          <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>4. Final billing</p>
          <p className="muted" style={{ minHeight: 42 }}>
            {finalInvoice
              ? "Final invoice draft exists — review and send when ready."
              : !estimate.job_id
                ? "No project linked — convert this approved estimate to a draft invoice when you are ready to bill."
                : projectClosed
                  ? "Project is complete — create or open the final invoice for billing review."
                  : "Final invoice is created when you mark the project complete (not when a visit ends)."}
          </p>
          {finalInvoice ? (
            <Link href={`/app/invoices/${finalInvoice.id}`} className="p7-btn p7-btn-primary p7-btn-sm">
              Open Final Invoice →
            </Link>
          ) : !estimate.job_id || projectClosed ? (
            // Convert is available when there is no project (standalone bill) or
            // the project is closed. Open projects keep the closeout gate so
            // field work cannot silently flip to "invoiced" via this button.
            <EstimateConvertButton estimateId={estimate.id} />
          ) : (
            <Link href={`/app/jobs/${estimate.job_id}#project-status`} className="p7-btn p7-btn-secondary p7-btn-sm">
              Complete project first →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
