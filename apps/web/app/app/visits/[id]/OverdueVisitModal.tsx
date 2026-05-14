"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal, Button, ScheduleFields } from "@/components/ui";
import type { ScheduleValue } from "@/components/ui";
import { scheduleToISOPair } from "@/components/ui";

function isoToScheduleValue(startIso: string, endIso: string): ScheduleValue {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const date = [
    start.getFullYear(),
    String(start.getMonth() + 1).padStart(2, "0"),
    String(start.getDate()).padStart(2, "0"),
  ].join("-");
  const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
  const rawDuration = Math.round((end.getTime() - start.getTime()) / 60_000);
  const validDurations = [30, 60, 90, 120, 180, 240, 480];
  const duration = validDurations.reduce((p, c) =>
    Math.abs(c - rawDuration) < Math.abs(p - rawDuration) ? c : p
  );
  return { date, startTime, duration };
}

function formatOverdueAge(scheduledStart: string): string {
  const ms = Date.now() - new Date(scheduledStart).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days < 1) return "less than a day";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

interface Props {
  visitId: string;
  scheduledStart: string;
  scheduledEnd: string;
  jobTitle: string | null;
}

export function OverdueVisitModal({ visitId, scheduledStart, scheduledEnd, jobTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleValue>(
    isoToScheduleValue(scheduledStart, scheduledEnd)
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-open on mount — only runs client-side so no SSR flash
  useEffect(() => {
    setOpen(true);
  }, []);

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    const { start, end } = scheduleToISOPair(schedule);
    if (!start || !end) { setError("Date and time are required."); return; }
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_start: start, scheduled_end: end }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to reschedule.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Unexpected error — please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleCancelVisit() {
    setPending(true);
    try {
      await fetch(`/api/v1/visits/${visitId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      setOpen(false);
      router.refresh();
    } catch {
      // silent — page will refresh to correct state regardless
    } finally {
      setPending(false);
    }
  }

  const overdueAge = formatOverdueAge(scheduledStart);
  const originalDate = new Date(scheduledStart).toLocaleDateString([], {
    weekday: "short", month: "short", day: "numeric",
  });

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Visit Overdue"
      data-testid="overdue-visit-modal"
      footer={
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button
            type="button"
            className="p7-btn p7-btn-ghost p7-btn-sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Dismiss for now
          </button>
          <button
            type="button"
            className="p7-btn p7-btn-danger p7-btn-sm"
            onClick={handleCancelVisit}
            disabled={pending}
          >
            Cancel visit
          </button>
        </div>
      }
    >
      <div className="p7-form-stack">
        <div
          style={{
            padding: "var(--space-3)",
            background: "#fef3c7",
            borderRadius: "var(--radius)",
            border: "1px solid #f59e0b",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, color: "#92400e" }}>
            This visit is overdue by {overdueAge}.
          </p>
          <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "#92400e" }}>
            {jobTitle ? `"${jobTitle}" was ` : "Originally "}scheduled for {originalDate}.
            Pick a new date so the customer isn&apos;t forgotten.
          </p>
        </div>

        <form id="reschedule-form" onSubmit={handleReschedule} className="p7-form-stack">
          {error && (
            <p role="alert" style={{ color: "var(--color-danger)", fontSize: "var(--text-sm)", margin: 0 }}>
              {error}
            </p>
          )}
          <ScheduleFields value={schedule} onChange={setSchedule} disabled={pending} />
          <Button
            type="submit"
            variant="primary"
            disabled={pending}
            loading={pending}
            style={{ alignSelf: "flex-start" }}
          >
            {pending ? "Saving…" : "Reschedule visit"}
          </Button>
        </form>
      </div>
    </Modal>
  );
}
