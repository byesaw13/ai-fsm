"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";

// Offered right after Clock In — "what are you doing now?" hands payroll off to
// the activity ledger (the two stay independent; this is just a convenience).
const QUICK_ACTIVITIES: ActivityType[] = ["job_work", "travel", "material_run", "estimate_visit", "admin"];

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
  const router = useRouter();
  const [clock, setClock] = useState<Clock | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // After clocking in, prompt for the current activity.
  const [promptActivity, setPromptActivity] = useState(false);

  async function load() {
    try {
      const res = await fetch("/api/v1/time-clock/current");
      // A non-2xx (transient error, expired session) must NOT be read as
      // "clocked out" — that would invite the wrong action. Surface it instead
      // and leave the last known state untouched.
      if (!res.ok) {
        setError("Couldn't load payroll — tap retry.");
        return;
      }
      const json = await res.json().catch(() => ({}));
      setClock((json.data ?? null) as Clock);
      setError(null);
    } catch {
      setError("Couldn't load payroll — tap retry.");
    }
  }

  // Load on mount, and whenever any Today-header action fires the shared signal
  // (e.g. Clock In opens the business day → BusinessDayBar must refresh too).
  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("ops:refresh", onRefresh);
    return () => window.removeEventListener("ops:refresh", onRefresh);
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
      // Refresh the whole Today header — clock-in also opened the business day,
      // so BusinessDayBar must re-read, not just this component.
      window.dispatchEvent(new Event("ops:refresh"));
      // Prompt for the current activity right after clocking in (not on out).
      setPromptActivity(path === "clock-in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clock action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pickActivity(type: ActivityType) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/activities/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activity_type: type }),
      });
      if (!res.ok) throw new Error();
      setPromptActivity(false);
      window.dispatchEvent(new Event("ops:refresh"));
      // The active-activity display (NowBar) is server-rendered and doesn't listen
      // to ops:refresh — re-fetch server props so it reflects the new activity.
      router.refresh();
    } catch {
      setError("Couldn't set your activity — try the activity tracker below.");
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
    marginBottom: "var(--space-3)",
  };

  if (clock === undefined) {
    return (
      <div style={{ ...wrap, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        {error ? (
          <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => void load()} disabled={busy}>
            {error} ↻
          </button>
        ) : (
          "Loading clock…"
        )}
      </div>
    );
  }

  const clockedIn = clock?.status === "open";

  return (
    <>
      <div style={{ ...wrap, marginBottom: clockedIn && promptActivity ? "var(--space-1)" : wrap.marginBottom }}>
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

      {clockedIn && promptActivity && (
        <div style={{ ...wrap, alignItems: "flex-start", flexDirection: "column", gap: "var(--space-2)" }}>
          <strong style={{ fontSize: "var(--text-sm)" }}>What are you doing now?</strong>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            {QUICK_ACTIVITIES.map((t) => (
              <button
                key={t}
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                onClick={() => pickActivity(t)}
                disabled={busy}
              >
                {ACTIVITY_TYPE_META[t].emoji} {ACTIVITY_TYPE_META[t].label}
              </button>
            ))}
            <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => setPromptActivity(false)} disabled={busy}>
              Later
            </button>
          </div>
        </div>
      )}
    </>
  );
}
