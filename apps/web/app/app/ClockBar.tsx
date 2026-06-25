"use client";

import { useEffect, useState } from "react";

/**
 * Payroll clock control (TASK-052, Operations Engine Phase 2 slice 3).
 *
 * "Was I working?" — independent of activity and of the business-day lifecycle.
 * Clocking in/out only records paid time. Self-contained via /api/v1/time-clock/*.
 */

type Clock = {
  id: string;
  clock_in_at: string;
  status: "open" | "closed";
} | null;

function elapsedLabel(sinceIso: string, now: number): string {
  const mins = Math.max(0, Math.round((now - new Date(sinceIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ClockBar() {
  const [clock, setClock] = useState<Clock | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  async function load() {
    try {
      const res = await fetch("/api/v1/time-clock/current");
      const json = await res.json().catch(() => ({}));
      setClock((json.data ?? null) as Clock);
    } catch {
      setError("Couldn't load the clock.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Tick the elapsed label while clocked in.
  useEffect(() => {
    if (!clock) return;
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [clock]);

  async function act(path: "clock-in" | "clock-out") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/time-clock/${path}`, { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? "That didn't work — try again.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clock action failed.");
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
    background: "var(--color-slate-50)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
    marginBottom: "var(--space-3)",
  };

  if (clock === undefined) {
    return <div style={{ ...wrap, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>Loading clock…</div>;
  }

  const clockedIn = clock?.status === "open";

  return (
    <div style={wrap}>
      <div style={{ fontSize: 20 }}>{clockedIn ? "🟢" : "⚪️"}</div>
      <div style={{ flex: 1, minWidth: 140 }}>
        <strong>Payroll</strong>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {clockedIn
            ? `Clocked in at ${timeLabel(clock!.clock_in_at)} · ${elapsedLabel(clock!.clock_in_at, now)}`
            : "Clocked out"}
        </div>
        {error && <div style={{ color: "var(--color-red-600, #dc2626)", fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>
      {clockedIn ? (
        <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => act("clock-out")} disabled={busy}>
          Clock Out
        </button>
      ) : (
        <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={() => act("clock-in")} disabled={busy}>
          Clock In
        </button>
      )}
    </div>
  );
}
