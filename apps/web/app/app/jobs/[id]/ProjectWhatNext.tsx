import Link from "next/link";
import type { Route } from "next";
import {
  PIPELINE_STAGE_LABELS,
  type PipelineStage,
} from "@ai-fsm/domain";
import { Card, LinkButton } from "@/components/ui";

export type PricingMode = "flat_rate" | "hourly_internal" | null;

/** Facts for one project handoff — single source of "what next". */
export interface ProjectWhatNextProps {
  jobId: string;
  clientId: string | null;
  jobStatus: string;
  stage: PipelineStage;
  pricingMode?: PricingMode;
  bookingRequestId: string | null;
  estimateCount: number;
  hasSentEstimate: boolean;
  lastEstimateSentAt: string | null;
  hasApprovedEstimate: boolean;
  approvedEstimateId: string | null;
  hasDepositInvoice: boolean;
  depositPaid: boolean;
  hasActiveVisit: boolean;
  activeVisitId: string | null;
  latestVisitId: string | null;
  hasUnpaidInvoice: boolean;
  hasPaidInvoice: boolean;
  latestInvoiceId: string | null;
  hasOpenPreSaleSiteVisit: boolean;
  hasCompletedPreSaleSiteVisit: boolean;
  hasExpiredEstimate: boolean;
  latestExpiredEstimateId: string | null;
  hasDraftWorkOrderWithPricing: boolean;
  preSaleSiteVisitId: string | null;
  /**
   * Field quiet + work orders done, project still open — owner must explicitly
   * complete the project and review billing. Never set by visit auto-complete.
   */
  readyForCloseout?: boolean;
  /** At least one completed execution visit exists. */
  hasCompletedExecutionVisit?: boolean;
  /** Open (non-terminal) work orders remain. */
  hasOpenWorkOrder?: boolean;
  /**
   * Open assessment (site_visit) without completed assessment packet.
   * Primary pre-sale handoff — always wins over generic schedule.
   */
  assessmentFormIncomplete?: boolean;
  /** site_visit completed (assessment path done enough to estimate). */
  hasCompletedAssessmentVisit?: boolean;
  /**
   * Sales walkthrough completed but no site_visit assessment — gap path.
   */
  hasSalesWalkthroughOnly?: boolean;
}

export interface WhatNextContent {
  /** One-line: where you are / what just happened */
  message: string;
  /** Optional short "blocked / waiting" line under the message */
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
  secondary?: { label: string; href: string };
  /** Extra secondary links (materials plan, approved estimate) */
  extras?: Array<{ label: string; href: string }>;
}

function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function clientQ(clientId: string | null): string {
  return clientId ? `&client_id=${clientId}` : "";
}

/**
 * Pure handoff logic for a project. Precedence:
 * final/standard money → owner closeout → active field → multi-day schedule →
 * commercial (deposit/estimate) → pre-sale.
 * Deposits never count as project billed. Visits never auto-complete projects.
 */
export function computeWhatNext(props: ProjectWhatNextProps): WhatNextContent {
  const {
    jobId,
    clientId,
    jobStatus,
    stage,
    pricingMode,
    bookingRequestId,
    estimateCount,
    hasSentEstimate,
    lastEstimateSentAt,
    hasApprovedEstimate,
    approvedEstimateId,
    hasDepositInvoice,
    depositPaid,
    hasActiveVisit,
    activeVisitId,
    latestVisitId,
    hasUnpaidInvoice,
    hasPaidInvoice,
    latestInvoiceId,
    hasOpenPreSaleSiteVisit,
    hasCompletedPreSaleSiteVisit,
    hasExpiredEstimate,
    latestExpiredEstimateId,
    hasDraftWorkOrderWithPricing,
    preSaleSiteVisitId,
    readyForCloseout = false,
    hasCompletedExecutionVisit = false,
    hasOpenWorkOrder = false,
    assessmentFormIncomplete = false,
    hasCompletedAssessmentVisit = false,
    hasSalesWalkthroughOnly = false,
  } = props;

  const cq = clientQ(clientId);
  const isTm = pricingMode === "hourly_internal";
  const visitId = activeVisitId ?? latestVisitId;
  const days = daysSince(lastEstimateSentAt);
  const estimateExtras = approvedEstimateId
    ? [
        { label: "Approved estimate", href: `/app/estimates/${approvedEstimateId}` },
        { label: "Materials plan", href: `/app/estimates/${approvedEstimateId}/shopping-list` },
      ]
    : undefined;

  // ── Close-out / money (final/standard only — caller must exclude deposits) ──
  if (hasPaidInvoice && !hasUnpaidInvoice && jobStatus === "invoiced") {
    return {
      message: "Paid — project complete",
      actionLabel: latestInvoiceId ? "Open Invoice" : undefined,
      actionHref: latestInvoiceId ? `/app/invoices/${latestInvoiceId}` : undefined,
      secondary: { label: "View invoices", href: `/app/invoices?job_id=${jobId}` },
    };
  }

  if (hasUnpaidInvoice || jobStatus === "invoiced") {
    return {
      message: "Invoice is out — collect payment",
      actionLabel: latestInvoiceId ? "Open Invoice" : "View Invoices",
      actionHref: latestInvoiceId
        ? `/app/invoices/${latestInvoiceId}`
        : `/app/invoices?job_id=${jobId}`,
      secondary: { label: "All invoices", href: `/app/invoices?job_id=${jobId}` },
    };
  }

  // Owner has explicitly completed the project — billing review.
  if (jobStatus === "completed") {
    const estimateParam = approvedEstimateId ? `&approved_estimate_id=${approvedEstimateId}` : "";
    const extras = approvedEstimateId
      ? [{ label: "Open approved estimate", href: `/app/estimates/${approvedEstimateId}` }]
      : undefined;

    if (latestInvoiceId) {
      return {
        message: isTm
          ? "Project closed — review and send the invoice"
          : "Project closed — review and send the final invoice",
        actionLabel: "Open Invoice",
        actionHref: `/app/invoices/${latestInvoiceId}`,
        secondary: { label: "All invoices", href: `/app/invoices?job_id=${jobId}` },
        extras,
      };
    }

    return {
      message: isTm
        ? "Project closed — invoice actual time and materials"
        : "Project closed — send the final invoice",
      actionLabel: "Create Invoice",
      actionHref: `/app/invoices/new?job_id=${jobId}${cq}${estimateParam}`,
      extras,
    };
  }

  // Field quiet + work packets done — owner must complete project for billing.
  if (readyForCloseout || (stage === "completed" && jobStatus !== "completed")) {
    return {
      message: "Ready for closeout — owner must complete project and review billing",
      detail: "Visits and work orders do not close the project. Mark the project complete when work is truly done.",
      actionLabel: "Complete Project",
      actionHref: `/app/jobs/${jobId}#project-status`,
      secondary: { label: "Schedule another work day", href: `/app/jobs/${jobId}/visits/new` },
      extras: estimateExtras,
    };
  }

  // ── Assessment-first pre-sale (before generic field schedule) ─────────
  if (hasOpenPreSaleSiteVisit && preSaleSiteVisitId) {
    if (assessmentFormIncomplete) {
      return {
        message: "Complete the assessment form",
        detail: "Capture rooms, photos, and scope before estimating.",
        actionLabel: "Open Assessment",
        actionHref: `/app/visits/${preSaleSiteVisitId}/assessment`,
        secondary: { label: "Open visit", href: `/app/visits/${preSaleSiteVisitId}` },
      };
    }
    return {
      message: "Finish the assessment visit",
      detail: "Assessment packet is done — close out the visit when you leave the site.",
      actionLabel: "Open Visit",
      actionHref: `/app/visits/${preSaleSiteVisitId}`,
      secondary: {
        label: "View assessment",
        href: `/app/visits/${preSaleSiteVisitId}/assessment`,
      },
    };
  }

  if (hasCompletedAssessmentVisit && estimateCount === 0) {
    return {
      message: "Create estimate from assessment",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
      secondary: {
        label: "Or T&M from notes",
        href: `/app/estimates/new?mode=tm&job_id=${jobId}${cq}&auto_generate=1`,
      },
    };
  }

  if (hasSalesWalkthroughOnly && estimateCount === 0) {
    return {
      message: "Pre-sale visit done without assessment packet",
      detail: "Create an estimate from notes, or schedule a full Assessment if more scope capture is needed.",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
      secondary: {
        label: "Schedule Assessment",
        href: `/app/jobs/${jobId}/visits/new?visit_type=site_visit&intent=assessment`,
      },
    };
  }

  // ── Field execution ────────────────────────────────────────────────────
  if (stage === "waiting") {
    return {
      message: "Project on hold",
      detail: "Resolve the blocker, then continue the visit.",
      actionLabel: visitId ? "Open Visit" : "Schedule Visit",
      actionHref: visitId ? `/app/visits/${visitId}` : `/app/jobs/${jobId}/visits/new`,
      secondary: { label: "All visits", href: `/app/visits?job_id=${jobId}` },
    };
  }

  if (hasActiveVisit) {
    return {
      message: "Work in progress",
      actionLabel: "Open Visit",
      actionHref: `/app/visits/${activeVisitId ?? visitId}`,
      secondary: { label: "All visits", href: `/app/visits?job_id=${jobId}` },
    };
  }

  // Multi-day / multi-week: completed days with open work still on the project.
  if (
    (jobStatus === "in_progress" || jobStatus === "scheduled") &&
    (hasCompletedExecutionVisit || hasOpenWorkOrder || hasApprovedEstimate)
  ) {
    return {
      message: hasCompletedExecutionVisit
        ? "Schedule the next work day"
        : depositPaid
          ? "Deposit received — schedule the work"
          : hasApprovedEstimate
            ? "Estimate approved — schedule the work"
            : "Schedule work",
      actionLabel: "Schedule Work Day",
      actionHref: `/app/jobs/${jobId}/visits/new`,
      secondary: visitId
        ? { label: "Latest visit", href: `/app/visits/${visitId}` }
        : { label: "All visits", href: `/app/visits?job_id=${jobId}` },
      extras: estimateExtras,
    };
  }

  // ── T&M: optional expectation estimate, then schedule / track time ─────
  if (isTm) {
    if (bookingRequestId && stage === "new_lead") {
      return {
        message: "Review the request, then run as time and materials",
        actionLabel: "Review Request",
        actionHref: `/app/requests/${bookingRequestId}`,
      };
    }
    if (estimateCount === 0) {
      return {
        message: "Time and materials — set hour expectations from notes, or schedule work",
        actionLabel: "Estimate from notes (T&M)",
        actionHref: `/app/estimates/new?mode=tm&job_id=${jobId}${cq}&auto_generate=1`,
        secondary: {
          label: "Schedule Visit",
          href: `/app/jobs/${jobId}/visits/new`,
        },
      };
    }
    return {
      message: "Time and materials — schedule work and track time",
      actionLabel: "Schedule Visit",
      actionHref: `/app/jobs/${jobId}/visits/new`,
      secondary: visitId
        ? { label: "Open latest visit", href: `/app/visits/${visitId}` }
        : {
            label: "Another T&M estimate",
            href: `/app/estimates/new?mode=tm&job_id=${jobId}${cq}&auto_generate=1`,
          },
    };
  }

  // ── Approved / deposit / schedule ──────────────────────────────────────
  if (hasApprovedEstimate && depositPaid && !hasActiveVisit) {
    return {
      message: "Deposit received — schedule the work",
      actionLabel: "Schedule Visit",
      actionHref: `/app/jobs/${jobId}/visits/new`,
      extras: estimateExtras,
    };
  }

  if (hasApprovedEstimate && hasDepositInvoice && !depositPaid) {
    return {
      message: "Waiting on deposit payment",
      actionLabel: latestInvoiceId ? "Open Invoice" : undefined,
      actionHref: latestInvoiceId ? `/app/invoices/${latestInvoiceId}` : undefined,
      secondary: { label: "View deposit invoice", href: `/app/invoices?job_id=${jobId}` },
    };
  }

  if (hasApprovedEstimate && !hasDepositInvoice) {
    return {
      message: "Estimate approved — schedule the work",
      actionLabel: "Schedule Visit",
      actionHref: `/app/jobs/${jobId}/visits/new`,
      extras: approvedEstimateId
        ? [
            { label: "Approved estimate", href: `/app/estimates/${approvedEstimateId}` },
            { label: "Materials plan", href: `/app/estimates/${approvedEstimateId}/shopping-list` },
          ]
        : undefined,
    };
  }

  // ── Pre-sale (fallback — assessment-first handled above) ───────────────
  if (hasCompletedPreSaleSiteVisit && estimateCount === 0) {
    return {
      message: "Create estimate from walkthrough",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
      secondary: {
        label: "Or T&M from notes",
        href: `/app/estimates/new?mode=tm&job_id=${jobId}${cq}&auto_generate=1`,
      },
    };
  }

  if (hasDraftWorkOrderWithPricing && estimateCount === 0) {
    return {
      message: "Create estimate from work order scope",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
      secondary: {
        label: "Or T&M from notes",
        href: `/app/estimates/new?mode=tm&job_id=${jobId}${cq}&auto_generate=1`,
      },
    };
  }

  // ── Estimate commercial ────────────────────────────────────────────────
  if (hasSentEstimate && !hasApprovedEstimate) {
    const sentMsg =
      days !== null && days > 0
        ? `Estimate sent ${days} day${days !== 1 ? "s" : ""} ago — waiting on customer`
        : "Estimate sent — waiting for customer response";
    return {
      message: sentMsg,
      secondary: { label: "View estimates", href: `/app/estimates?job_id=${jobId}` },
    };
  }

  if (hasExpiredEstimate && !hasSentEstimate && latestExpiredEstimateId) {
    return {
      message: "Estimate expired — revise and resend",
      actionLabel: "Revise Estimate",
      actionHref: `/app/estimates/${latestExpiredEstimateId}`,
    };
  }

  if (estimateCount > 0 && !hasSentEstimate) {
    return {
      message: "Estimate drafted — send it to the customer",
      secondary: { label: "View estimate", href: `/app/estimates?job_id=${jobId}` },
    };
  }

  if (bookingRequestId && stage === "new_lead") {
    return {
      message: "Review the request before estimating or scheduling",
      actionLabel: "Review Request",
      actionHref: `/app/requests/${bookingRequestId}`,
    };
  }

  if ((jobStatus === "draft" || jobStatus === "quoted" || stage === "estimate_needed") && estimateCount === 0) {
    return {
      message: "Next step: create an estimate",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
      secondary: {
        label: "Or T&M from notes",
        href: `/app/estimates/new?mode=tm&job_id=${jobId}${cq}&auto_generate=1`,
      },
    };
  }

  // Fallback from pipeline stage label only
  return {
    message: PIPELINE_STAGE_LABELS[stage] ?? "Continue this project",
    detail: "Open related records from the lists below.",
    secondary: { label: "View visits", href: `/app/visits?job_id=${jobId}` },
  };
}

/**
 * Single project handoff: where you are, what next, one primary action.
 * Replaces WhatNextBanner + JobCommandPanel + competing body CTAs.
 */
export function ProjectWhatNext(props: ProjectWhatNextProps) {
  const content = computeWhatNext(props);
  const isTm = props.pricingMode === "hourly_internal";

  return (
    <Card data-testid="project-what-next" style={{ marginBottom: "var(--space-4)" }}>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        <div>
          <p
            style={{
              margin: 0,
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--fg-muted)",
            }}
          >
            What next
            <span style={{ fontWeight: 500, marginLeft: 8 }}>
              · {PIPELINE_STAGE_LABELS[props.stage]}
              {isTm ? " · T&M" : ""}
            </span>
          </p>
          <p
            style={{
              margin: "var(--space-2) 0 0",
              fontSize: "var(--text-base)",
              fontWeight: 700,
              color: "var(--fg)",
            }}
            data-testid="project-what-next-message"
          >
            {content.message}
          </p>
          {content.detail ? (
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              {content.detail}
            </p>
          ) : null}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          {content.actionLabel && content.actionHref ? (
            <LinkButton
              href={content.actionHref as Route}
              variant="primary"
              data-testid="project-what-next-primary"
            >
              {content.actionLabel} →
            </LinkButton>
          ) : null}
          {content.secondary ? (
            <Link
              href={content.secondary.href as Route}
              style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}
              data-testid="project-what-next-secondary"
            >
              {content.secondary.label} →
            </Link>
          ) : null}
          {content.extras?.map((x) => (
            <Link
              key={x.href}
              href={x.href as Route}
              style={{ fontSize: "var(--text-sm)", color: "var(--accent)", textDecoration: "none" }}
            >
              {x.label} →
            </Link>
          ))}
        </div>
      </div>
    </Card>
  );
}
