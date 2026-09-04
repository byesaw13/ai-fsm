"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { clockDurationMinutes, validateClockCorrection } from "@ai-fsm/domain";

/**
 * Correct or void today's payroll clock entries (TASK-052). Corrections never
 * delete — the API voids the old session and re-adds a corrected one. Lives
 * under the ClockBar; loads lazily when the user opens "Fix times".
 */

type Row = {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  status: "open" | "closed";
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeRange(r: Row): string {
  const t = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const mins = clockDurationMinutes(r.clock_in_at, r.clock_out_at);
  const dur = `${Math.floor(mins / 60)}h ${mins % 60}m`;
  return r.clock_out_at ? `${t(r.clock_in_at)} – ${t(r.clock_out_at)} · ${dur}` : `${t(r.clock_in_at)} – open · ${dur}`;
}

export function ClockCorrections() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null); // id in Correct mode
  const [voiding, setVoiding] = useState<string | null>(null); // id in Void mode
  const [inAt, setInAt] = useState("");
  const [outAt, setOutAt] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/v1/time-clock/today");
      if (!res.ok) throw new Error();
      const json = await res.json();
      setRows((json.data ?? []) as Row[]);
    } catch {
      setError("Couldn't load clock entries.");
    }
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    setEditing(null);
    setVoiding(null);
    if (next && rows === null) void load();
  }

  function startCorrect(r: Row) {
    setEditing(r.id);
    setVoiding(null);
    setInAt(toLocalInput(r.clock_in_at));
    setOutAt(toLocalInput(r.clock_out_at));
    setReason("");
    setError(null);
  }

  function reset() {
    setEditing(null);
    setVoiding(null);
    setReason("");
    setError(null);
  }

  async function afterChange() {
    reset();
    await load();
    window.dispatchEvent(new Event("ops:refresh"));
    router.refresh();
  }

  async function saveCorrection(id: string) {
    const clockInAt = inAt ? new Date(inAt).toISOString() : "";
    const clockOutAt = outAt ? new Date(outAt).toISOString() : null;
    const check = validateClockCorrection({ clockInAt, clockOutAt, reason });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/time-clock/${id}/correct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clock_in_at: check.clockInAt, clock_out_at: check.clockOutAt, reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? "Correction failed.");
      }
      await afterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Correction failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmVoid(id: string) {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/time-clock/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error?.message ?? "Void failed.");
      }
      await afterChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Void failed.");
    } finally {
      setBusy(false);
    }
  }

  const label = { fontSize: "var(--text-sm)", color: "var(--fg-muted)" } as const;
  const fieldRow = { display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "center", marginTop: "var(--space-1)" } as const;

  return (
    <div style={{ marginBottom: "var(--space-3)" }}>
      <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={toggle} aria-expanded={open}>
        {open ? "Hide clock fixes" : "Fix times"}
      </button>

      {open && (
        <div style={{ marginTop: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-3)", background: "var(--bg-subtle)" }}>
          {error && <div style={{ color: "var(--color-red-600, #dc2626)", fontSize: 12, marginBottom: 6 }}>{error}</div>}
          {rows === null && <div style={label}>Loading…</div>}
          {rows !== null && rows.length === 0 && <div style={label}>No clock entries to fix today.</div>}

          {rows?.map((r) => (
            <div key={r.id} style={{ padding: "var(--space-2) 0", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-2)" }}>
                <span style={{ fontSize: "var(--text-sm)" }}>{timeRange(r)}</span>
                {editing !== r.id && voiding !== r.id && (
                  <span style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => startCorrect(r)} disabled={busy}>
                      Correct
                    </button>
                    <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => { setVoiding(r.id); setEditing(null); setReason(""); setError(null); }} disabled={busy}>
                      Void
                    </button>
                  </span>
                )}
              </div>

              {editing === r.id && (
                <div>
                  <div style={fieldRow}>
                    <label style={label}>In <input type="datetime-local" value={inAt} onChange={(e) => setInAt(e.target.value)} /></label>
                    <label style={label}>Out <input type="datetime-local" value={outAt} onChange={(e) => setOutAt(e.target.value)} /></label>
                  </div>
                  <div style={fieldRow}>
                    <input type="text" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                  </div>
                  <div style={fieldRow}>
                    <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={() => saveCorrection(r.id)} disabled={busy}>Save</button>
                    <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={reset} disabled={busy}>Cancel</button>
                    <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>Leave Out blank to keep it open.</span>
                  </div>
                </div>
              )}

              {voiding === r.id && (
                <div style={fieldRow}>
                  <input type="text" placeholder="Reason for voiding (required)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                  <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => confirmVoid(r.id)} disabled={busy}>Confirm void</button>
                  <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={reset} disabled={busy}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
