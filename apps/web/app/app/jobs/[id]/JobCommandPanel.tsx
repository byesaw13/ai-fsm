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

type Props = {
  stage: PipelineStage;
  jobId: string;
  clientId: string | null;
  bookingRequestId: string | null;
  activeVisitId: string | null;
  latestVisitId: string | null;
  approvedEstimateId: string | null;
};

const STAGE_COPY: Record<PipelineStage, string> = {
  new_lead:        "Review the intake before estimating or scheduling.",
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

function actionForStage(props: Props): CommandAction | null {
  const clientParam = props.clientId ? `&client_id=${props.clientId}` : "";

  switch (props.stage) {
    case "new_lead":
      return props.bookingRequestId
        ? { label: "Review Intake", href: `/app/booking-requests/${props.bookingRequestId}` }
        : { label: "Open Job", href: `/app/jobs/${props.jobId}` };
    case "estimate_needed":
      return {
        label: "Create Estimate",
        href: `/app/estimates/new?job_id=${props.jobId}${clientParam}`,
      };
    case "estimate_sent":
      return { label: "View Estimates", href: `/app/estimates?job_id=${props.jobId}` };
    case "approved_ready":
      return { label: "Schedule Visit", href: `/app/jobs/${props.jobId}/visits/new` };
    case "scheduled":
    case "in_progress":
    case "waiting":
      return props.activeVisitId || props.latestVisitId
        ? { label: "Open Visit", href: `/app/visits/${props.activeVisitId ?? props.latestVisitId}` }
        : { label: "Schedule Visit", href: `/app/jobs/${props.jobId}/visits/new` };
    case "completed":
      return {
        label: "Create Invoice",
        href: `/app/invoices/new?job_id=${props.jobId}${clientParam}`,
      };
    case "invoiced":
      return { label: "View Invoices", href: `/app/invoices?job_id=${props.jobId}` };
    case "archived":
      return { label: "View Invoices", href: `/app/invoices?job_id=${props.jobId}`, variant: "secondary" };
  }
}

export function JobCommandPanel(props: Props) {
  const action = actionForStage(props);
  const currentIndex = PIPELINE_STAGE_ORDER.indexOf(props.stage);
  const approvedEstimateId = props.approvedEstimateId;

  return (
    <Card data-testid="job-command-panel" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader title="Command" />
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
            {STAGE_COPY[props.stage]}
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
          aria-label="Pipeline progress"
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
              <Link
                key={stage}
                href="/app/pipeline"
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
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {PIPELINE_STAGE_LABELS[stage]}
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
