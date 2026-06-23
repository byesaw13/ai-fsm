"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

// EPIC-007 TASK-046: owner control for passive location capture — master
// on/off + a temporary pause. Capture also requires an active Start-Day
// workday session (shown here as status).

export function LocationCaptureControl({
  enabled,
  pausedUntil,
  hasActiveWorkday,
}: {
  enabled: boolean;
  pausedUntil: string | null;
  hasActiveWorkday: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const paused = !!pausedUntil && new Date(pausedUntil).getTime() > Date.now();
  const status = !enabled
    ? { label: "Capture off", color: "var(--fg-muted)" }
    : paused
      ? { label: "Paused", color: "var(--color-amber-600, #b45309)" }
      : !hasActiveWorkday
        ? { label: "Starts at Start Day", color: "var(--fg-muted)" }
        : { label: "Capturing", color: "var(--status-success, #15803d)" };

  async function patch(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/location-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error?.message ?? "Could not update");
        return;
      }
      toast.success(msg);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: status.color, display: "inline-block" }} />
        <span style={{ color: "var(--fg-muted)" }}>Location: <strong style={{ color: status.color }}>{status.label}</strong></span>
      </span>
      {enabled && (
        paused ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ paused_until: null }, "Capture resumed")}>Resume</Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => {
            const end = new Date(); end.setHours(23, 59, 59, 0);
            patch({ paused_until: end.toISOString() }, "Paused for today");
          }}>Pause today</Button>
        )
      )}
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => patch({ enabled: !enabled }, enabled ? "Capture turned off" : "Capture turned on")}>
        {enabled ? "Turn off" : "Turn on"}
      </Button>
    </div>
  );
}
