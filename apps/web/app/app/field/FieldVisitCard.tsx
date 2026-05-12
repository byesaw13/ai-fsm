"use client";

import { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

interface FieldVisit {
  id: string;
  status: string;
  scheduled_start: string | null;
  job_id: string | null;
  job_title: string | null;
  client_name: string | null;
  property_address: string | null;
}

interface FieldVisitCardProps {
  visit: FieldVisit;
}

// Each entry maps current DB status → the transition target to POST to /transition.
// "Start Visit" on a scheduled visit targets "arrived"; the transition endpoint
// collapses scheduled→arrived→in_progress in one transaction and returns in_progress.
const STATUS_TRANSITIONS: Record<string, { label: string; transitionTarget: string; effectiveStatus: string; color: string } | null> = {
  scheduled:   { label: "Start Visit", transitionTarget: "arrived",   effectiveStatus: "in_progress", color: "#2563eb" },
  arrived:     { label: "Begin Work",  transitionTarget: "in_progress", effectiveStatus: "in_progress", color: "#d97706" },
  in_progress: { label: "End Visit",   transitionTarget: "completed",  effectiveStatus: "completed",   color: "#16a34a" },
  completed:   null,
  cancelled:   null,
};

export function FieldVisitCard({ visit: initialVisit }: FieldVisitCardProps) {
  const [visit, setVisit] = useState(initialVisit);
  const [transitioning, setTransitioning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const { success, error: toastError } = useToast();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isActive = visit.status === "in_progress";

  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isActive]);

  function formatElapsed(secs: number) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
    return `${s}s`;
  }

  async function handleTransition() {
    const t = STATUS_TRANSITIONS[visit.status];
    if (!t) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/v1/visits/${visit.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: t.transitionTarget }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toastError(data?.error?.message ?? "Could not update visit status");
        return;
      }
      setVisit({ ...visit, status: t.effectiveStatus });
      success(t.effectiveStatus === "completed" ? "Visit completed!" : "Visit started");
    } catch {
      toastError("Network error");
    } finally {
      setTransitioning(false);
    }
  }

  const transition = STATUS_TRANSITIONS[visit.status];
  const scheduledTime = visit.scheduled_start
    ? new Date(visit.scheduled_start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: `2px solid ${isActive ? "#16a34a" : "var(--border)"}`,
        borderRadius: "var(--radius-lg, 12px)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
        boxShadow: isActive ? "0 0 0 4px rgba(22,163,74,0.1)" : undefined,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: "var(--text-lg, 1.125rem)", color: "var(--fg)" }}>
            {visit.job_title ?? "Visit"}
          </p>
          {visit.client_name && (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              {visit.client_name}
            </p>
          )}
        </div>
        {scheduledTime && (
          <span
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--fg-muted)",
              whiteSpace: "nowrap",
              paddingLeft: "var(--space-3)",
            }}
          >
            {scheduledTime}
          </span>
        )}
      </div>

      {/* Address */}
      {visit.property_address && (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {visit.property_address}
        </p>
      )}

      {/* Active timer */}
      {isActive && (
        <div
          style={{
            background: "rgba(22,163,74,0.08)",
            borderRadius: "var(--radius)",
            padding: "var(--space-2) var(--space-3)",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "var(--text-xl, 1.25rem)", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#16a34a" }}>
            {formatElapsed(elapsedSeconds)}
          </span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: "var(--space-2)" }}>
            on site
          </span>
        </div>
      )}

      {/* Completed state */}
      {visit.status === "completed" && (
        <div style={{ textAlign: "center", color: "#16a34a", fontWeight: 600 }}>
          ✓ Completed
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {transition && (
          <button
            type="button"
            onClick={handleTransition}
            disabled={transitioning}
            style={{
              flex: 1,
              padding: "var(--space-3) var(--space-4)",
              background: transition.color,
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius)",
              fontSize: "var(--text-base)",
              fontWeight: 700,
              cursor: transitioning ? "not-allowed" : "pointer",
              opacity: transitioning ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {transitioning ? "…" : transition.label}
          </button>
        )}
        <Link
          href={`/app/visits/${visit.id}`}
          style={{
            padding: "var(--space-3) var(--space-4)",
            background: "var(--bg)",
            color: "var(--fg-muted)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            fontSize: "var(--text-sm)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
          }}
        >
          Details
        </Link>
      </div>
    </div>
  );
}
