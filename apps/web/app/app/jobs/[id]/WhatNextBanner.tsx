import Link from "next/link";
import type { Route } from "next";

interface WhatNextBannerProps {
  jobId: string;
  clientId: string | null;
  jobStatus: string;
  estimateCount: number;
  hasSentEstimate: boolean;
  lastEstimateSentAt: string | null;
  hasApprovedEstimate: boolean;
  hasDepositInvoice: boolean;
  depositPaid: boolean;
  hasActiveVisit: boolean;
  invoiceCount: number;
  hasUnpaidInvoice: boolean;
  hasPaidInvoice: boolean;
}

// Returns the day difference from a date string to now
function daysSince(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const diff = Date.now() - new Date(isoDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

interface BannerContent {
  color: string;
  bg: string;
  icon: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  secondary?: { label: string; href: string };
}

function computeBanner(props: WhatNextBannerProps): BannerContent | null {
  const {
    jobId, clientId, jobStatus, estimateCount, hasSentEstimate, lastEstimateSentAt,
    hasApprovedEstimate, hasDepositInvoice, depositPaid, hasActiveVisit,
    invoiceCount, hasUnpaidInvoice, hasPaidInvoice,
  } = props;

  const days = daysSince(lastEstimateSentAt);
  const clientParam = clientId ? `&client_id=${clientId}` : "";

  // Paid — all done
  if (hasPaidInvoice && jobStatus === "invoiced") {
    return {
      color: "#065f46",
      bg: "#d1fae5",
      icon: "✓",
      message: "Paid — job complete!",
    };
  }

  // Invoiced but unpaid
  if (hasUnpaidInvoice && jobStatus === "invoiced") {
    return {
      color: "#92400e",
      bg: "#fef3c7",
      icon: "⟳",
      message: "Invoice sent — follow up for payment",
      secondary: { label: "View invoices →", href: `/app/invoices?job_id=${jobId}` },
    };
  }

  // Completed, no invoice yet
  if ((jobStatus === "completed" || jobStatus === "in_progress") && invoiceCount === 0) {
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "→",
      message: "Work complete — send the final invoice",
      actionLabel: "Create Invoice",
      actionHref: `/app/invoices/new?job_id=${jobId}${clientParam}`,
    };
  }

  // In progress with active visit
  if (jobStatus === "in_progress" || (jobStatus === "scheduled" && hasActiveVisit)) {
    return {
      color: "#92400e",
      bg: "#fef3c7",
      icon: "●",
      message: "Work in progress",
      secondary: { label: "View visits →", href: `/app/visits?job_id=${jobId}` },
    };
  }

  // Accepted + deposit paid, no visit scheduled
  if (hasApprovedEstimate && depositPaid && !hasActiveVisit) {
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "→",
      message: "Deposit received — schedule the work",
      actionLabel: "Schedule Visit",
      actionHref: `/app/jobs/${jobId}/visits/new`,
    };
  }

  // Accepted, deposit invoice exists but not paid
  if (hasApprovedEstimate && hasDepositInvoice && !depositPaid) {
    return {
      color: "#5b21b6",
      bg: "#ede9fe",
      icon: "◈",
      message: "Waiting on deposit payment",
      secondary: { label: "View deposit invoice →", href: `/app/invoices?job_id=${jobId}` },
    };
  }

  // Approved estimate, no deposit invoice yet (unusual — auto-created on approval)
  if (hasApprovedEstimate && !hasDepositInvoice) {
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "→",
      message: "Estimate approved — schedule the work",
      actionLabel: "Schedule Visit",
      actionHref: `/app/jobs/${jobId}/visits/new`,
    };
  }

  // Estimate sent, waiting on customer
  if (hasSentEstimate && !hasApprovedEstimate) {
    const sentMsg = days !== null && days > 0
      ? `Estimate sent ${days} day${days !== 1 ? "s" : ""} ago — no response yet`
      : "Estimate sent — waiting for customer response";
    return {
      color: "#374151",
      bg: "#f3f4f6",
      icon: "◷",
      message: sentMsg,
      secondary: { label: "View estimates →", href: `/app/estimates?job_id=${jobId}` },
    };
  }

  // Draft with estimates, none sent
  if (estimateCount > 0 && !hasSentEstimate) {
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "→",
      message: "Estimate drafted — send it to the customer",
      secondary: { label: "View estimate →", href: `/app/estimates?job_id=${jobId}` },
    };
  }

  // Draft with no estimates
  if (jobStatus === "draft" && estimateCount === 0) {
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "→",
      message: "Next step: create an estimate",
      actionLabel: "New Estimate",
      actionHref: `/app/estimates/new?job_id=${jobId}${clientParam}`,
    };
  }

  return null;
}

export function WhatNextBanner(props: WhatNextBannerProps) {
  const banner = computeBanner(props);
  if (!banner) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: banner.bg,
        borderRadius: "var(--radius)",
        marginBottom: "var(--space-4)",
        flexWrap: "wrap",
      }}
      data-testid="what-next-banner"
    >
      <span
        style={{
          fontSize: "var(--text-base)",
          color: banner.color,
          fontWeight: 700,
          minWidth: 20,
          textAlign: "center",
        }}
        aria-hidden="true"
      >
        {banner.icon}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          color: banner.color,
        }}
      >
        {banner.message}
      </span>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        {banner.secondary && (
          <Link
            href={banner.secondary.href as Route}
            style={{ fontSize: "var(--text-sm)", color: banner.color, opacity: 0.8 }}
          >
            {banner.secondary.label}
          </Link>
        )}
        {banner.actionLabel && banner.actionHref && (
          <Link
            href={banner.actionHref as Route}
            style={{
              padding: "var(--space-1) var(--space-3)",
              background: banner.color,
              color: "#fff",
              borderRadius: "var(--radius)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            {banner.actionLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
