"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Business Day lifecycle control (TASK-051, Operations Engine Phase 1 slice 3).
 *
 * Status display for non-field surfaces. Day close ritual lives on Day Review.
 */

type Day = {
  id: string;
  status: "OPEN" | "ACTIVE" | "PAUSED" | "READY_TO_CLOSE" | "CLOSED" | "REOPENED";
  business_date: string;
  reopened_reason: string | null;
} | null;

const STATUS_LABEL: Record<NonNullable<Day>["status"], string> = {
  OPEN: "Open",
  ACTIVE: "Active",
  PAUSED: "Paused",
  READY_TO_CLOSE: "Ready to close",
  CLOSED: "Closed",
  REOPENED: "Reopened",
};

export function BusinessDayBar() {
  const [day, setDay] = useState<Day | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/v1/business-day/current");
      if (!res.ok) {
        setError("Couldn't load today — tap retry.");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setDay((json.data ?? null) as Day);
      setError(null);
    } catch {
      setError("Couldn't load today — tap retry.");
    }
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("ops:refresh", onRefresh);
    return () => window.removeEventListener("ops:refresh", onRefresh);
  }, []);

  async function openDay() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/business-day/current", { method: "POST" });
      if (!res.ok) throw new Error();
      window.dispatchEvent(new Event("ops:refresh"));
    } catch {
      setError("Couldn't open the day.");
    } finally {
      setBusy(false);
    }
  }

  async function transition(to: NonNullable<Day>["status"], withReason?: string) {
    if (!day) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/business-day/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: day.id, to, reason: withReason }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? "That change isn't allowed right now.");
      }
      setReopening(false);
      setReason("");
      window.dispatchEvent(new Event("ops:refresh"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the day.");
    } finally {
      setBusy(false);
    }
  }

  const wrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "var(--space-3)",
    flexWrap: "wrap",
    padding: "var(--space-3)",
    background: "var(--bg-subtle)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    marginBottom: "var(--space-4)",
  };

  if (day === undefined) {
    return (
      <div style={{ ...wrap, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        {error ? (
          <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => void load()} disabled={busy}>
            {error} ↻
          </button>
        ) : (
          "Loading today…"
        )}
      </div>
    );
  }

  const canEndDay = day && day.status !== "CLOSED";

  return (
    <div style={wrap}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <strong>Business Day</strong>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", overflowWrap: "anywhere" }}>
          {day === null
            ? "Not opened yet"
            : (
              <>
                <span className="my-day-mobile-only">{STATUS_LABEL[day.status]}</span>
                <span className="my-day-desktop-only" style={{ display: "none" }}>
                  {`${STATUS_LABEL[day.status]}${day.status === "CLOSED" ? "" : " — close the day from Day Review"}`}
                </span>
              </>
            )}
        </div>
        {error && <div style={{ color: "var(--color-red-600, #dc2626)", fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {day === null && (
          <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={openDay} disabled={busy}>
            Open Day
          </button>
        )}

        {canEndDay && (
          <Link href="/app/day-review" className="p7-btn p7-btn-secondary p7-btn-sm">
            End day on Day Review
          </Link>
        )}

        {day && day.status === "CLOSED" && !reopening && (
          <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => setReopening(true)} disabled={busy}>
            Reopen day
          </button>
        )}

        {day && day.status === "CLOSED" && reopening && (
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (e.g. emergency call)"
              style={{ minHeight: 34, padding: "0 8px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", fontSize: 13 }}
            />
            <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={() => transition("REOPENED", reason)} disabled={busy || !reason.trim()}>
              Reopen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}