import Link from "next/link";
import { CreateJobFromEstimateButton } from "../CreateJobFromEstimateButton";
import { EstimateConvertButton } from "../EstimateConvertButton";
import type { EstimateRow } from "../detail-data";

interface Props {
  estimate: EstimateRow;
  jobVisitCount: number;
  hasMaterialsPlan: boolean;
}

/** Approved-estimate handoff: materials → schedule → final billing. */
export function ApprovedHandoff({ estimate, jobVisitCount, hasMaterialsPlan }: Props) {
  return (
    <div id="materials-plan-handoff" className="card action-card" data-testid="approved-project-handoff">
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)", flexWrap: "wrap", marginBottom: "var(--space-3)" }}>
        <div>
          <h2 style={{ marginBottom: "var(--space-1)" }}>Approved Project Handoff</h2>
          <p className="muted" style={{ margin: 0 }}>
            Move from approved scope into purchasing, scheduling, work, and final billing.
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
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)" }}>
          <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>2. Schedule</p>
          <p className="muted" style={{ minHeight: 42 }}>
            {estimate.job_id
              ? jobVisitCount > 0
                ? "Visits are already on the job. Manage timing from the job thread."
                : "Schedule the first work visit from the approved estimate."
              : "Link this estimate to a job before scheduling work."}
          </p>
          {estimate.job_id ? (
            <Link
              href={jobVisitCount > 0 ? `/app/jobs/${estimate.job_id}` : `/app/jobs/${estimate.job_id}/visits/new`}
              className="p7-btn p7-btn-primary p7-btn-sm"
            >
              {jobVisitCount > 0 ? "Manage Job →" : "Schedule Work →"}
            </Link>
          ) : (
            <CreateJobFromEstimateButton estimateId={estimate.id} />
          )}
        </div>
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)" }}>
          <p style={{ margin: "0 0 var(--space-1)", fontWeight: 700 }}>3. Final Billing</p>
          <p className="muted" style={{ minHeight: 42 }}>
            Create the draft invoice from the approved estimate when the work is ready to bill.
          </p>
          <EstimateConvertButton estimateId={estimate.id} />
        </div>
      </div>
    </div>
  );
}
