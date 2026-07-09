"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, Modal } from "@/components/ui";
import type { EstimateNotStartedReminder } from "@/lib/field/estimate-reminders";

export function EstimateNotStartedPrompt() {
  const router = useRouter();
  const [reminder, setReminder] = useState<EstimateNotStartedReminder | null>(null);
  const [open, setOpen] = useState(false);
  const [muting, setMuting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/v1/field/estimate-reminders");
        const data = (await res.json()) as { data?: EstimateNotStartedReminder | null };
        if (data.data) {
          setReminder(data.data);
          setOpen(true);
        }
      } catch {
        /* non-blocking */
      }
    })();
  }, []);

  async function mute(days: number) {
    if (!reminder) return;
    setMuting(true);
    try {
      await fetch("/api/v1/field/estimate-reminders/mute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: reminder.visitId, days }),
      });
      setOpen(false);
      setReminder(null);
    } finally {
      setMuting(false);
    }
  }

  if (!reminder) return null;

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Estimate not started"
      data-testid="estimate-not-started-prompt"
      footer={
        <>
          <Button variant="ghost" onClick={() => void mute(7)} loading={muting} disabled={muting}>
            Mute 7 days
          </Button>
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={muting}>
            Later
          </Button>
          <Button
            variant="primary"
            onClick={() => router.push(`/app/estimates/new?job_id=${reminder.jobId}` as Route)}
            disabled={muting}
          >
            Create estimate
          </Button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
        Walkthrough for <strong>{reminder.clientName}</strong>
        {reminder.propertyAddress ? ` (${reminder.propertyAddress})` : ""} was completed{" "}
        <strong>{reminder.hoursSince} hours ago</strong> and still has no estimate.
      </p>
    </Modal>
  );
}