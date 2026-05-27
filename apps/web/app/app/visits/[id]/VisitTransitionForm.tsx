"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VisitStatus } from "@ai-fsm/domain";
import { Button, useToast } from "@/components/ui";
import type { ButtonVariant } from "@/components/ui";

interface Props {
  visitId: string;
  currentStatus: VisitStatus;
  role: string;
  jobType?: string;
  beforePhotoCount?: number;
  afterPhotoCount?: number;
  closingAllDone?: boolean;
  isMembershipVisit?: boolean;
  membershipPhase?: string;
  membershipSnapshotSentAt?: string | null;
}

// What the tech sees: plain-English action buttons sized for a phone screen.
// "arrived" is sent to the API — the server atomically advances
// scheduled→arrived→in_progress, recording arrived_at in the same transaction.
// The "arrived" entry here handles the rare case where a visit is already in
// arrived state (e.g. if the tech was on an older app version).
const TECH_ACTIONS: Partial<Record<VisitStatus, { label: string; next: VisitStatus; variant: ButtonVariant }>> = {
  scheduled:   { label: "Start Job",    next: "arrived",     variant: "primary"   },
  arrived:     { label: "Start Job",    next: "in_progress", variant: "primary"   },
  in_progress: { label: "Complete Job", next: "completed",   variant: "secondary" },
};

export function VisitTransitionForm({
  visitId,
  currentStatus,
  role,
  jobType,
  beforePhotoCount = 0,
  afterPhotoCount = 0,
  closingAllDone = false,
  isMembershipVisit = false,
  membershipPhase,
  membershipSnapshotSentAt = null,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function transition(targetStatus: VisitStatus) {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error?.message ?? "Could not update status");
      } else {
        const labels: Record<string, string> = {
          arrived:     "Job started — on site",
          in_progress: "Job started — on site",
          completed:   "Visit completed",
          cancelled:   "Visit cancelled",
        };
        toast.success(labels[targetStatus] ?? "Status updated");
        router.refresh();
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  // ── Tech view ──────────────────────────────────────────────────────────────
  if (role === "tech") {
    const action = TECH_ACTIONS[currentStatus];
    if (!action) return null; // completed / cancelled — nothing to do

    const isRepairFlow = jobType !== undefined && jobType !== "maintenance";
    const isCompletionAction = action.next === "completed";

    // Hard gates for completing a visit
    const blockers: string[] = [];
    if (isRepairFlow && isCompletionAction) {
      if (afterPhotoCount === 0) blockers.push("Add at least one photo of the completed work");
      if (!closingAllDone) blockers.push("Check off all closing checklist steps");
    }
    if (isMembershipVisit && isCompletionAction && membershipPhase !== "reporting") {
      blockers.push("Advance to the Reporting phase and complete the visit summary before closing");
    }
    if (isMembershipVisit && isCompletionAction && membershipPhase === "reporting" && !membershipSnapshotSentAt) {
      blockers.push("Mark the visit summary as sent before closing");
    }
    const isBlocked = blockers.length > 0;

    return (
      <div data-testid="visit-transition-buttons">
        {isBlocked && (
          <div
            style={{
              marginBottom: "var(--space-3)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              background: "#fef2f2",
              border: "1px solid #fca5a5",
            }}
          >
            <p style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "#991b1b", marginBottom: "var(--space-1)" }}>
              Required before closing:
            </p>
            <ul style={{ margin: 0, paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)", color: "#b91c1c" }}>
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </div>
        )}
        <Button
          onClick={() => transition(action.next)}
          disabled={loading || isBlocked}
          variant={action.variant}
          style={{ width: "100%", padding: "var(--space-4)", fontSize: "var(--text-lg)" }}
          data-testid={`visit-transition-btn-${action.next}`}
        >
          {loading ? "Updating…" : action.label}
        </Button>
      </div>
    );
  }

  // ── Admin / owner view ─────────────────────────────────────────────────────
  // Owners/admins often do the work themselves — give them the same progression
  // buttons as a tech, plus the cancel option.
  if (currentStatus === "scheduled" || currentStatus === "arrived" || currentStatus === "in_progress") {
    const action = TECH_ACTIONS[currentStatus];
    return (
      <div data-testid="visit-transition-buttons" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {action && (
          <Button
            onClick={() => transition(action.next)}
            disabled={loading}
            variant={action.variant}
            style={{ width: "100%", padding: "var(--space-4)", fontSize: "var(--text-lg)" }}
            data-testid={`visit-transition-btn-${action.next}`}
          >
            {loading ? "Updating…" : action.label}
          </Button>
        )}
        <Button
          onClick={() => transition("cancelled")}
          disabled={loading}
          variant="danger"
          size="sm"
          data-testid="visit-transition-btn-cancelled"
        >
          Cancel Visit
        </Button>
      </div>
    );
  }

  return null;
}
