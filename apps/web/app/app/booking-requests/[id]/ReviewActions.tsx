"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";

type ReviewStatus = "needs_info" | "duplicate" | "reviewed" | "cancelled";

const ACTION_LABELS: Record<ReviewStatus, string> = {
  needs_info: "Needs Info",
  duplicate:  "Mark Duplicate",
  reviewed:   "Mark Reviewed",
  cancelled:  "Cancel Request",
};

const ACTION_VARIANTS: Record<ReviewStatus, "primary" | "secondary" | "ghost" | "danger"> = {
  reviewed:   "primary",
  needs_info: "secondary",
  duplicate:  "ghost",
  cancelled:  "danger",
};

interface Props {
  bookingId: string;
  currentStatus: string;
  initialNotes: string | null;
  jobId: string | null;
  preferredDate: string;
  preferredTimeSlot: string | null;
}

export function ReviewActions({ bookingId, currentStatus, initialNotes, jobId, preferredDate, preferredTimeSlot }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFinal = currentStatus === "converted" || currentStatus === "cancelled";

  async function handleStatus(status: ReviewStatus) {
    setPending(status);
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, review_notes: notes || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error?.message ?? "Failed to update");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function handleConvert() {
    setPending("convert");
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferred_date: preferredDate,
          preferred_time_slot: preferredTimeSlot,
          review_notes: notes || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error?.message ?? "Failed to convert");
        return;
      }
      if (d.data?.visit_id) {
        router.push(`/app/visits/${d.data.visit_id}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function handleRepair() {
    setPending("repair");
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error?.message ?? "Failed to create pipeline job");
        return;
      }
      if (d.data?.jobId) {
        router.push(`/app/jobs/${d.data.jobId}`);
      } else {
        router.refresh();
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  async function saveNotes() {
    setPending("notes");
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_notes: notes || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error?.message ?? "Failed to save notes");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="p7-form-stack">
      {error && <div className="p7-card-danger" role="alert">{error}</div>}

      <Textarea
        id="review_notes"
        label="Review Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Duplicate of #…, needs address clarification, out of service area…"
        rows={3}
        disabled={!!pending || isFinal}
      />

      {!isFinal && (
        <>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {(["reviewed", "needs_info", "duplicate", "cancelled"] as ReviewStatus[]).map((s) => (
              <Button
                key={s}
                variant={ACTION_VARIANTS[s]}
                onClick={() => handleStatus(s)}
                loading={pending === s}
                disabled={!!pending || currentStatus === s}
                size="sm"
              >
                {ACTION_LABELS[s]}
              </Button>
            ))}
          </div>

          {!jobId && (currentStatus === "reviewed" || currentStatus === "pending" || currentStatus === "needs_info") && (
            <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
              <Button
                variant="primary"
                onClick={handleRepair}
                loading={pending === "repair"}
                disabled={!!pending}
              >
                Create Pipeline Job →
              </Button>
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                Links this intake to a client, property, and draft job so it appears on the pipeline.
              </p>
            </div>
          )}

          {jobId && (currentStatus === "reviewed" || currentStatus === "pending" || currentStatus === "needs_info") && (
            <div style={{ marginTop: "var(--space-2)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
              <Button
                variant="primary"
                onClick={handleConvert}
                loading={pending === "convert"}
                disabled={!!pending}
              >
                Schedule Site Visit →
              </Button>
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                Schedules a site visit to assess and measure the project. Create an estimate after the visit.
              </p>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={saveNotes}
            loading={pending === "notes"}
            disabled={!!pending}
          >
            Save Notes Only
          </Button>
        </>
      )}

      {isFinal && (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          This request is {currentStatus} and cannot be changed.
        </p>
      )}
    </div>
  );
}
