import Link from "next/link";
import type { Route } from "next";
import type { VisitStatus, MembershipVisitPhase } from "@ai-fsm/domain";

interface VisitCommandBannerProps {
  status: VisitStatus;
  isRepairFlow: boolean;
  isMembershipVisit: boolean;
  membershipPhase: MembershipVisitPhase | null;
  beforePhotoCount: number;
  afterPhotoCount: number;
  hasIssueDescription: boolean;
  hasTechNotes: boolean;
  closingAllDone: boolean;
  checklistDone: number;
  checklistTotal: number;
}

interface BannerContent {
  color: string;
  bg: string;
  icon: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}

function computeBanner(props: VisitCommandBannerProps): BannerContent | null {
  const {
    status, isRepairFlow, isMembershipVisit, membershipPhase,
    beforePhotoCount, afterPhotoCount, hasIssueDescription, hasTechNotes,
    closingAllDone, checklistDone, checklistTotal,
  } = props;

  if (status === "cancelled") return null;

  if (status === "completed") {
    return { color: "#065f46", bg: "#d1fae5", icon: "✓", message: "Visit complete." };
  }

  if (status === "scheduled") {
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "◷",
      message: "Upcoming visit — tap \"On My Way\" when you're leaving.",
      actionLabel: "On My Way",
      actionHref: "#visit-timeline",
    };
  }

  if (status === "arrived") {
    return {
      color: "#92400e",
      bg: "#fef3c7",
      icon: "●",
      message: isRepairFlow
        ? "You've arrived — start the work from Actions."
        : "You've arrived — begin the visit from Actions.",
      actionLabel: "Open Actions",
      actionHref: "#visit-actions",
    };
  }

  if (status === "in_progress") {
    if (isRepairFlow) {
      const hasIssue = hasIssueDescription || beforePhotoCount > 0;
      const hasResolution = hasTechNotes || afterPhotoCount > 0;

      if (!hasIssue) {
        return {
          color: "#1e40af",
          bg: "#dbeafe",
          icon: "1",
          message: "Step 1 of 4: Describe the problem and add before photos.",
          actionLabel: "Open Issue",
          actionHref: "#visit-issue",
        };
      }
      if (!hasResolution) {
        return {
          color: "#1e40af",
          bg: "#dbeafe",
          icon: "3",
          message: "Step 3 of 4: Document your resolution — add after photos and describe what you did.",
          actionLabel: "Open Resolution",
          actionHref: "#visit-resolution",
        };
      }
      if (!closingAllDone) {
        return {
          color: "#1e40af",
          bg: "#dbeafe",
          icon: "4",
          message: "Step 4 of 4: Complete the closing checklist, then mark the visit done.",
          actionLabel: "Open Checklist",
          actionHref: "#visit-closing-checklist",
        };
      }
      return {
        color: "#065f46",
        bg: "#d1fae5",
        icon: "✓",
        message: "All documented — mark the visit complete.",
        actionLabel: "Open Completion",
        actionHref: "#visit-completion",
      };
    }

    // Maintenance / membership flow
    if (isMembershipVisit && membershipPhase === "reporting") {
      return {
        color: "#065f46",
        bg: "#d1fae5",
        icon: "→",
        message: "Checklist done — complete the visit summary.",
        actionLabel: "Open Summary",
        actionHref: "#visit-summary",
      };
    }
    if (checklistTotal > 0) {
      const remaining = checklistTotal - checklistDone;
      if (remaining > 0) {
        return {
          color: "#1e40af",
          bg: "#dbeafe",
          icon: "✓",
          message: `${checklistDone} of ${checklistTotal} checklist items done — ${remaining} remaining.`,
          actionLabel: "Open Checklist",
          actionHref: "#visit-checklist",
        };
      }
      return {
        color: "#065f46",
        bg: "#d1fae5",
        icon: "✓",
        message: "Checklist complete — add any notes and mark the visit done.",
        actionLabel: "Open Notes",
        actionHref: "#visit-notes",
      };
    }
    return {
      color: "#1e40af",
      bg: "#dbeafe",
      icon: "●",
      message: "Visit in progress — complete your work and mark done.",
      actionLabel: "Open Completion",
      actionHref: "#visit-completion",
    };
  }

  return null;
}

export function VisitCommandBanner(props: VisitCommandBannerProps) {
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
      data-testid="visit-command-banner"
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
  );
}
