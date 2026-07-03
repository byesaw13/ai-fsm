"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveDayCloseStatus } from "./day-close-status";
import type { DayCloseRowStatus, DayCloseStatusPayload } from "./types";
import { CloseButton } from "../day-review/CloseButton";

function fmtOdo(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US");
}

const STATUS_ICON: Record<DayCloseRowStatus, string> = {
  ok: "🟢",
  blocked: "🔴",
  warning: "🟡",
};

function TaskRow({
  title,
  status,
  children,
}: {
  title: string;
  status: DayCloseRowStatus;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "var(--bg-subtle)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: 20 }}>{STATUS_ICON[status]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{title}</strong>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: 4 }}>{children}</div>
      </div>
    </div>
  );
}

export function DayCloseChecklist({
  businessDayId,
  dayStatus,
  closedAt,
  initial,
}: {
  businessDayId: string;
  dayStatus: string;
  closedAt: string | null;
  initial: DayCloseStatusPayload;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState(initial);
  const [notesAcknowledged, setNotesAcknowledged] = useState(false);
  const [endOdometer, setEndOdometer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPayload(initial);
  }, [initial]);

  const derived = useMemo(
    () => deriveDayCloseStatus({ ...payload, notesAcknowledged }),
    [payload, notesAcknowledged],
  );

  async function refresh() {
    router.refresh();
    window.dispatchEvent(new Event("ops:refresh"));
  }

  async function clockOut() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/time-clock/clock-out", { method: "POST" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? "Could not clock out");
      }
      setPayload((p) => ({ ...p, clockOpen: false }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clock out");
    } finally {
      setBusy(false);
    }
  }

  async function stopActivity() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/activities/stop", { method: "POST" });
      if (!res.ok) throw new Error("Could not stop activity");
      setPayload((p) => ({ ...p, activeActivity: null }));
      await refresh();
    } catch {
      setError("Could not stop activity");
    } finally {
      setBusy(false);
    }
  }

  async function closeMileage() {
    const session = payload.openSession;
    if (!session) return;
    const odometer = Number(endOdometer);
    if (!Number.isInteger(odometer) || odometer <= session.startOdometer) {
      setError(`Ending odometer must be greater than start (${fmtOdo(session.startOdometer)})`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ end_odometer: odometer }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error?.message ?? "Could not close mileage");
      }
      setPayload((p) => ({ ...p, openSession: null }));
      setEndOdometer("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close mileage");
    } finally {
      setBusy(false);
    }
  }

  const isClosed = dayStatus === "CLOSED";

  return (
    <section style={{ marginBottom: "var(--space-6)" }} data-testid="day-close-checklist">
      {!isClosed && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: "var(--space-3)" }}>
          {derived.readyCount} of {derived.totalTasks} ready
          {derived.softWarningCount > 0 && ` · ${derived.softWarningCount} reminder${derived.softWarningCount !== 1 ? "s" : ""}`}
        </p>
      )}

      {error && (
        <p style={{ color: "var(--color-red-600, #dc2626)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", marginBottom: "var(--space-5)" }}>
        <TaskRow title="Payroll" status={derived.rows.payroll.status}>
          {payload.clockOpen ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span>Still clocked in — clock out when you&apos;re done for the day.</span>
              <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => void clockOut()} disabled={busy}>
                Clock Out
              </button>
            </div>
          ) : (
            "Payroll clock is out."
          )}
        </TaskRow>

        <TaskRow title="Activity" status={derived.rows.activity.status}>
          {payload.activeActivity ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span>
                Tracker running: <strong>{payload.activeActivity.label}</strong>
              </span>
              <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => void stopActivity()} disabled={busy}>
                Stop Tracking
              </button>
            </div>
          ) : (
            "No activity tracker running."
          )}
        </TaskRow>

        <TaskRow title="Mileage" status={derived.rows.mileage.status}>
          {payload.openSession ? (
            <>
              <span>
                Open session on <strong>{payload.openSession.vehicleName ?? "vehicle"}</strong> (started{" "}
                {fmtOdo(payload.openSession.startOdometer)} mi).
              </span>
              <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "end", marginTop: "var(--space-2)", flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                  Ending odometer
                  <input
                    value={endOdometer}
                    onChange={(e) => setEndOdometer(e.target.value)}
                    inputMode="numeric"
                    placeholder="Odo reading"
                    style={{
                      minHeight: 34,
                      width: 120,
                      padding: "0 8px",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border)",
                      fontFamily: "var(--font-mono), monospace",
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="p7-btn p7-btn-secondary p7-btn-sm"
                  onClick={() => void closeMileage()}
                  disabled={busy || !endOdometer}
                >
                  Close Mileage
                </button>
              </div>
            </>
          ) : (
            "Mileage session closed."
          )}
        </TaskRow>

        <TaskRow title="Expenses" status={derived.rows.expenses.status}>
          {payload.missingReceiptPhotos > 0 ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span>
                {payload.missingReceiptPhotos} expense{payload.missingReceiptPhotos !== 1 ? "s" : ""} missing receipt photos.
              </span>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <Link href={"/app/expenses" as Route} className="p7-btn p7-btn-secondary p7-btn-sm">
                  Attach Photos
                </Link>
                <Link href={"/app/expenses/new" as Route} className="p7-btn p7-btn-ghost p7-btn-sm">
                  Add Expense
                </Link>
              </div>
            </div>
          ) : (
            "Today's expenses look good."
          )}
        </TaskRow>

        <TaskRow title="Notes" status={derived.rows.notes.status}>
          {notesAcknowledged ? (
            "Nothing else to note."
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <span>Anything else you need to note from today?</span>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {payload.visitsToday > 0 && (
                  <Link href={"/app/visits" as Route} className="p7-btn p7-btn-ghost p7-btn-sm">
                    View Visits
                  </Link>
                )}
                <button
                  type="button"
                  className="p7-btn p7-btn-secondary p7-btn-sm"
                  onClick={() => setNotesAcknowledged(true)}
                  disabled={busy}
                >
                  I&apos;m good
                </button>
              </div>
            </div>
          )}
        </TaskRow>
      </div>

      <CloseButton
        businessDayId={businessDayId}
        status={dayStatus}
        closedAt={closedAt}
        disabled={!derived.canClose}
        label={derived.closeButtonHint}
      />
      {!derived.canClose && !isClosed && (
        <p style={{ fontSize: 12, color: "var(--fg-muted)", textAlign: "center", marginTop: "var(--space-2)" }}>
          Finish the red items above to close the day.
        </p>
      )}
    </section>
  );
}