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
  invoiceCount: number;
  hasUnpaidInvoice: boolean;
  hasPaidInvoice: boolean;
  latestInvoiceId: string | null;
  hasOpenPreSaleSiteVisit: boolean;
  hasCompletedPreSaleSiteVisit: boolean;
  hasExpiredEstimate: boolean;
  latestExpiredEstimateId: string | null;
  hasDraftWorkOrderWithPricing: boolean;
  preSaleSiteVisitId: string | null;
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
 * Pure handoff logic for a project. Precedence: close-out / money first, then
 * field work, then commercial gates (deposit, estimate), then pre-sale.
 * T&M skips estimate-centric steps.
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
    invoiceCount,
    hasUnpaidInvoice,
    hasPaidInvoice,
    latestInvoiceId,
    hasOpenPreSaleSiteVisit,
    hasCompletedPreSaleSiteVisit,
    hasExpiredEstimate,
    latestExpiredEstimateId,
    hasDraftWorkOrderWithPricing,
    preSaleSiteVisitId,
  } = props;

  const cq = clientQ(clientId);
  const isTm = pricingMode === "hourly_internal";
  const visitId = activeVisitId ?? latestVisitId;
  const days = daysSince(lastEstimateSentAt);

  // ── Close-out / money ──────────────────────────────────────────────────
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

  if (jobStatus === "completed" && invoiceCount === 0) {
    const estimateParam = approvedEstimateId ? `&approved_estimate_id=${approvedEstimateId}` : "";
    return {
      message: isTm
        ? "Work complete — invoice actual time and materials"
        : "Work complete — send the final invoice",
      actionLabel: "Create Invoice",
      actionHref: `/app/invoices/new?job_id=${jobId}${cq}${estimateParam}`,
      extras: approvedEstimateId
        ? [{ label: "Open approved estimate", href: `/app/estimates/${approvedEstimateId}` }]
        : undefined,
    };
  }

  // ── Field execution ────────────────────────────────────────────────────
  if (jobStatus === "in_progress" || (jobStatus === "scheduled" && hasActiveVisit) || stage === "waiting") {
    if (stage === "waiting") {
      return {
        message: "Project on hold",
        detail: "Resolve the blocker, then continue the visit.",
        actionLabel: visitId ? "Open Visit" : "Schedule Visit",
        actionHref: visitId ? `/app/visits/${visitId}` : `/app/jobs/${jobId}/visits/new`,
        secondary: { label: "All visits", href: `/app/visits?job_id=${jobId}` },
      };
    }
    return {
      message: hasActiveVisit ? "Work in progress" : "Work is scheduled",
      actionLabel: visitId ? "Open Visit" : "Schedule Visit",
      actionHref: visitId ? `/app/visits/${visitId}` : `/app/jobs/${jobId}/visits/new`,
      secondary: { label: "All visits", href: `/app/visits?job_id=${jobId}` },
    };
  }

  // ── T&M: skip estimate-centric ladder once past intake ─────────────────
  if (isTm) {
    if (bookingRequestId && stage === "new_lead") {
      return {
        message: "Review the request, then run as time and materials",
        actionLabel: "Review Request",
        actionHref: `/app/requests/${bookingRequestId}`,
      };
    }
    return {
      message: "Time and materials — schedule work and track time",
      actionLabel: "Schedule Visit",
      actionHref: `/app/jobs/${jobId}/visits/new`,
      secondary: visitId
        ? { label: "Open latest visit", href: `/app/visits/${visitId}` }
        : undefined,
    };
  }

  // ── Approved / deposit / schedule ──────────────────────────────────────
  if (hasApprovedEstimate && depositPaid && !hasActiveVisit) {
    return {
      message: "Deposit received — schedule the work",
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

  // ── Pre-sale ───────────────────────────────────────────────────────────
  if (hasOpenPreSaleSiteVisit && preSaleSiteVisitId) {
    return {
      message: "Complete site assessment",
      actionLabel: "Open Assessment",
      actionHref: `/app/visits/${preSaleSiteVisitId}/assessment`,
    };
  }

  if (hasCompletedPreSaleSiteVisit && estimateCount === 0) {
    return {
      message: "Create estimate from walkthrough",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
    };
  }

  if (hasDraftWorkOrderWithPricing && estimateCount === 0) {
    return {
      message: "Create estimate from work order scope",
      actionLabel: "Create Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${cq}&pricing_mode=flat_rate`,
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
