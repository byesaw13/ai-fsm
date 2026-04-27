"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ScheduleFields, SectionHeader, useToast } from "@/components/ui";
import type { ScheduleValue } from "@/components/ui";
import { scheduleToISOPair } from "@/components/ui";

interface Props {
  visitId: string;
  initialStart: string;
  initialEnd: string;
}

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

export function VisitRescheduleForm({ visitId, initialStart, initialEnd }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [schedule, setSchedule] = useState<ScheduleValue>(
    isoToScheduleValue(initialStart, initialEnd)
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { start, end } = scheduleToISOPair(schedule);
    if (!start || !end) { setError("Date and time are required"); return; }
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
        setError(data.error?.message ?? "Failed to reschedule visit");
        return;
      }
      toast.success("Visit rescheduled");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card data-testid="visit-reschedule-form">
      <SectionHeader title="Reschedule" />
      <form onSubmit={handleSubmit} className="p7-form-stack" style={{ marginTop: "var(--space-3)" }}>
        {error && (
          <p className="error-inline" role="alert">{error}</p>
        )}
        <ScheduleFields value={schedule} onChange={setSchedule} disabled={pending} />
        <div className="p7-form-actions">
          <Button type="submit" disabled={pending} loading={pending}>
            {pending ? "Saving…" : "Save Schedule"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
