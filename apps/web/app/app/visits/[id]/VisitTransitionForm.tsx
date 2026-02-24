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
}

// What the tech sees: plain-English action buttons sized for a phone screen.
// "arrived" is still sent to the API — the server auto-advances to in_progress
// and records arrived_at in the same transaction.
const TECH_ACTIONS: Partial<Record<VisitStatus, { label: string; next: VisitStatus; variant: ButtonVariant }>> = {
  scheduled:   { label: "Start Job",    next: "arrived",   variant: "primary"   },
  in_progress: { label: "Complete Job", next: "completed", variant: "secondary" },
};

export function VisitTransitionForm({ visitId, currentStatus, role }: Props) {
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

    return (
      <div data-testid="visit-transition-buttons">
        <Button
          onClick={() => transition(action.next)}
          disabled={loading}
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
  // Admins can see the timeline but should not be advancing status on behalf
  // of a tech.  The only override available is cancelling the visit.
  if (currentStatus === "scheduled" || currentStatus === "in_progress") {
    return (
      <div data-testid="visit-transition-buttons">
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Status updates are made by the assigned technician.
        </p>
        <Button
          onClick={() => transition("cancelled")}
          disabled={loading}
          variant="danger"
          size="sm"
          data-testid="visit-transition-btn-cancelled"
        >
          {loading ? "Cancelling…" : "Cancel Visit"}
        </Button>
      </div>
    );
  }

  return null;
}
