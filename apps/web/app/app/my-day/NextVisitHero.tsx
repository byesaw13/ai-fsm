"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, useToast } from "@/components/ui";
import {
  buildMapsUrl,
  buildTelUrl,
  heroPrimaryAction,
  type HeroVisit,
} from "@/lib/my-day/visit-hero";

async function transitionVisit(visitId: string, targetStatus: string): Promise<string | null> {
  const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: targetStatus }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return data.error?.message ?? "Could not update status";
  return null;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function NextVisitHero({ visit }: { visit: HeroVisit }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const mapsUrl = buildMapsUrl(visit.property_address);
  const telUrl = buildTelUrl(visit.client_phone);
  const action = heroPrimaryAction(visit.status);

  async function handlePrimary() {
    if (!action) return;
    setPending(true);
    const target = action === "start" ? "arrived" : "completed";
    const err = await transitionVisit(visit.id, target);
    setPending(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(action === "start" ? "Job started — on site" : "Visit completed");
    router.refresh();
  }

  const btnStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "var(--space-3)",
    borderRadius: "var(--radius-md)",
    fontSize: "var(--text-sm)",
    fontWeight: 700,
    textDecoration: "none",
    minHeight: 44,
    border: "1px solid var(--border)",
    background: "var(--bg-card)",
    color: "var(--fg)",
    cursor: "pointer",
  };

  return (
    <Card padding="sm" data-testid="next-visit-hero">
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        Next visit · {formatTime(visit.scheduled_start)}
      </div>
      <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", overflowWrap: "anywhere" }}>
        {visit.job_title ?? "Untitled job"}
      </div>
      {visit.client_name && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{visit.client_name}</div>
      )}
      {visit.property_address && (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-secondary)", overflowWrap: "anywhere", marginTop: 4 }}>
          {visit.property_address}
        </div>
      )}
      <div className="my-day-action-row" style={{ marginTop: "var(--space-3)" }}>
        {mapsUrl ? (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={btnStyle} data-testid="hero-navigate">
            Navigate
          </a>
        ) : (
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5 }} title="No address on file">
            Navigate
          </button>
        )}
        {telUrl ? (
          <a href={telUrl} style={btnStyle} data-testid="hero-call">
            Call
          </a>
        ) : (
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5 }} title="No phone on file">
            Call
          </button>
        )}
        {action ? (
          <button
            type="button"
            onClick={handlePrimary}
            disabled={pending}
            data-testid="hero-start-job"
            style={{
              ...btnStyle,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
            }}
          >
            {pending ? "…" : action === "start" ? "Start Job" : "Complete Job"}
          </button>
        ) : (
          <button type="button" disabled style={{ ...btnStyle, opacity: 0.5 }}>
            —
          </button>
        )}
      </div>
    </Card>
  );
}