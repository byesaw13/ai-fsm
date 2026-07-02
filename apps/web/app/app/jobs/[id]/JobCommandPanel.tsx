import Link from "next/link";
import type { Route } from "next";
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_ORDER,
  type PipelineStage,
} from "@ai-fsm/domain";
import { Card, LinkButton, SectionHeader } from "@/components/ui";

type CommandAction = {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
};

type PricingMode = "flat_rate" | "hourly_internal" | null;

type Props = {
  stage: PipelineStage;
  jobId: string;
  clientId: string | null;
  bookingRequestId: string | null;
  pricingMode?: PricingMode;
  activeVisitId: string | null;
  latestVisitId: string | null;
  approvedEstimateId: string | null;
  latestInvoiceId: string | null;
};

const FIXED_BID_STAGE_COPY: Record<PipelineStage, string> = {
  new_lead:        "Review the request before estimating or scheduling.",
  estimate_needed: "This job needs an estimate before the customer can approve work.",
  estimate_sent:   "The estimate is out. Follow up or review the customer's response.",
  approved_ready:  "Customer approval is in. Open the approved estimate, materials plan, or schedule the work.",
  scheduled:       "Work is scheduled. Open the visit to prepare or update field status.",
  in_progress:     "Work is active. Keep the visit current and complete it from field mode.",
  waiting:         "Job is blocked. Resolve the blocker before the visit can continue.",
  completed:       "Work is complete. Send the final invoice.",
  invoiced:        "Invoice is out. Track payment and follow up.",
  archived:        "This job is closed or cancelled.",
};

const TM_STAGE_COPY: Record<PipelineStage, string> = {
  new_lead:        "Review the request, then open the time-and-materials project.",
  estimate_needed: "This job is set to time and materials. Skip the estimate and open the project.",
  estimate_sent:   "Time and materials does not need an estimate. Open the job and start tracking work.",
  approved_ready:  "The request is approved. Open the project and schedule work as needed.",
  scheduled:       "Work is scheduled. Open the visit to prepare or update field status.",
  in_progress:     "Work is active. Keep the visit current and capture time and materials.",
  waiting:         "Job is blocked. Resolve the blocker before the visit can continue.",
  completed:       "Work is complete. Create the invoice from actual time and materials.",
  invoiced:        "Invoice is out. Track payment and follow up.",
  archived:        "This job is closed or cancelled.",
};

function actionForStage(props: Props): CommandAction | null {
  const clientParam = props.clientId ? `&client_id=${props.clientId}` : "";
  const isTm = props.pricingMode === "hourly_internal";

  switch (props.stage) {
    case "new_lead":
      return props.bookingRequestId
        ? { label: "Review Request", href: `/app/requests/${props.bookingRequestId}` }
        : { label: isTm ? "Open T&M Project" : "Open Project", href: `/app/jobs/${props.jobId}` };
    case "estimate_needed":
      return isTm
        ? { label: "Open T&M Project", href: `/app/jobs/${props.jobId}` }
        : {
            label: "Create Estimate",
            href: `/app/estimates/new?job_id=${props.jobId}${clientParam}&pricing_mode=flat_rate`,
          };
    case "estimate_sent":
      return isTm
        ? { label: "Open T&M Project", href: `/app/jobs/${props.jobId}` }
        : { label: "View Estimates", href: `/app/estimates?job_id=${props.jobId}` };
    case "approved_ready":
      return isTm
        ? { label: "Open T&M Project", href: `/app/jobs/${props.jobId}` }
        : { label: "Schedule Work", href: `/app/jobs/${props.jobId}/visits/new` };
    case "scheduled":
    case "in_progress":
    case "waiting":
      return props.activeVisitId || props.latestVisitId
        ? { label: isTm ? "Open T&M Visit" : "Open Visit", href: `/app/visits/${props.activeVisitId ?? props.latestVisitId}` }
        : { label: isTm ? "Open T&M Project" : "Book Walkthrough", href: `/app/jobs/${props.jobId}/visits/new` };
    case "completed":
      return {
        label: "Create Invoice",
        href: `/app/invoices/new?job_id=${props.jobId}${clientParam}`,
      };
    case "invoiced":
      return props.latestInvoiceId
        ? { label: "Open Invoice", href: `/app/invoices/${props.latestInvoiceId}` }
        : { label: "View Invoices", href: `/app/invoices?job_id=${props.jobId}` };
    case "archived":
      return { label: "View Invoices", href: `/app/invoices?job_id=${props.jobId}`, variant: "secondary" };
  }
}

export function JobCommandPanel(props: Props) {
  const action = actionForStage(props);
  const currentIndex = PIPELINE_STAGE_ORDER.indexOf(props.stage);
  const stageCopy = props.pricingMode === "hourly_internal" ? TM_STAGE_COPY : FIXED_BID_STAGE_COPY;
  const approvedEstimateId = props.approvedEstimateId;

  return (
    <Card data-testid="job-command-panel" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Command" />
      <p style={{ margin: 0, marginTop: "calc(var(--space-1) * -1)", color: "var(--fg-muted)", fontSize: "var(--text-xs)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {props.pricingMode === "hourly_internal" ? "Time and materials" : "Fixed bid"}
      </p>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-lg)",
              fontWeight: 700,
              color: "var(--fg)",
            }}
          >
            {PIPELINE_STAGE_LABELS[props.stage]}
          </p>
          <p style={{ margin: "var(--space-1) 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            {stageCopy[props.stage]}
          </p>
        </div>

        {action && (
          <div style={{ display: "grid", gap: "var(--space-2)" }}>
            <LinkButton
              href={action.href as Route}
              variant={action.variant ?? "primary"}
              data-testid="job-primary-action"
            >
              {action.label} →
            </LinkButton>
            {props.stage === "approved_ready" && approvedEstimateId && (
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <Link href={`/app/estimates/${approvedEstimateId}`} style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>Open approved estimate →</Link>
                <Link href={`/app/estimates/${approvedEstimateId}/shopping-list`} style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>Materials plan →</Link>
              </div>
            )}
            {props.stage === "completed" && approvedEstimateId && (
              <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                <Link href={`/app/estimates/${approvedEstimateId}`} style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}>Open approved estimate →</Link>
              </div>
            )}
          </div>
        )}

        <div
          aria-label="Workflow progress"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(88px, 1fr))",
            gap: 6,
          }}
        >
          {PIPELINE_STAGE_ORDER.map((stage, index) => {
            const isCurrent = stage === props.stage;
            const isPast = index < currentIndex;
            return (
              <div
                key={stage}
                style={{
                  minHeight: 34,
                  padding: "6px 8px",
                  borderRadius: "var(--radius)",
                  border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
                  background: isCurrent
                    ? "var(--accent-subtle)"
                    : isPast
                      ? "var(--bg-subtle)"
                      : "var(--bg-card)",
                  color: isCurrent ? "var(--accent)" : "var(--fg-muted)",
                  fontSize: "var(--text-xs)",
                  fontWeight: isCurrent ? 700 : 500,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {PIPELINE_STAGE_LABELS[stage]}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
