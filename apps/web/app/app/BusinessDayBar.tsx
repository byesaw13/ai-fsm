"use client";

import { useEffect, useState } from "react";

/**
 * Business Day lifecycle control (TASK-051, Operations Engine Phase 1 slice 3).
 *
 * Self-contained: it owns the day's status via /api/v1/business-day/* and is
 * independent of mileage/activity. Closing a trip or stopping the timer does NOT
 * close the day — only "Close Business Day" here does, and Reopen is normal.
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

// A real Day Close checklist: closing the business day is a deliberate review,
// not a one-tap. Every item must be acknowledged before CLOSED is offered.
const CLOSE_CHECKLIST = [
  "Payroll reviewed (clocked out if done)",
  "Activities reviewed",
  "Mileage reviewed",
  "Materials & expenses entered",
  "Notes complete",
];

export function BusinessDayBar() {
  const [day, setDay] = useState<Day | undefined>(undefined); // undefined = loading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const allChecked = CLOSE_CHECKLIST.every((item) => checked[item]);
  function toggle(item: string) {
    setChecked((c) => ({ ...c, [item]: !c[item] }));
  }

  // Clear acknowledgments whenever the day isn't ready-to-close, so re-entering
  // READY_TO_CLOSE always requires a fresh review (no stale all-checked state).
  useEffect(() => {
    if (day?.status !== "READY_TO_CLOSE") setChecked({});
  }, [day?.status]);

  async function load() {
    try {
      const res = await fetch("/api/v1/business-day/current");
      // A non-2xx must NOT be read as "not opened yet" — surface it and keep the
      // last known state rather than inviting a redundant Open Day.
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

  // Load on mount and on the shared Today-header signal (e.g. Clock In opens the
  // day server-side, so this bar must refresh even though its own buttons weren't used).
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
    background: "var(--color-slate-50)",
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

  return (
    <>
    <div style={wrap}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <strong>Business Day</strong>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {day === null
            ? "Not opened yet"
            : `${STATUS_LABEL[day.status]}${day.status === "CLOSED" ? "" : " — closing a trip or stopping the timer won't close it"}`}
        </div>
        {error && <div style={{ color: "var(--color-red-600, #dc2626)", fontSize: 12, marginTop: 4 }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {day === null && (
          <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={openDay} disabled={busy}>
            Open Day
          </button>
        )}

        {day && ["OPEN", "ACTIVE", "PAUSED", "REOPENED"].includes(day.status) && (
          <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => transition("READY_TO_CLOSE")} disabled={busy}>
            Mark day ready to close
          </button>
        )}

        {day && day.status === "READY_TO_CLOSE" && (
          <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => transition("ACTIVE")} disabled={busy}>
            Back to active
          </button>
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

    {day && day.status === "READY_TO_CLOSE" && (
      <div style={{ ...wrap, flexDirection: "column", alignItems: "stretch", gap: "var(--space-2)" }}>
        <strong style={{ fontSize: "var(--text-sm)" }}>Ready to close today?</strong>
        {CLOSE_CHECKLIST.map((item) => (
          <label key={item} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", fontSize: "var(--text-sm)", cursor: "pointer" }}>
            <input type="checkbox" checked={!!checked[item]} onChange={() => toggle(item)} />
            {item}
          </label>
        ))}
        <button
          type="button"
          className="p7-btn p7-btn-primary p7-btn-sm"
          onClick={() => transition("CLOSED")}
          disabled={busy || !allChecked}
          style={{ alignSelf: "flex-start", marginTop: "var(--space-1)" }}
        >
          Close Business Day
        </button>
        {!allChecked && (
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>Check every item to close.</span>
        )}
      </div>
    )}
    </>
  );
}
