"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, useToast } from "@/components/ui";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_META,
  type ActivityType,
} from "@ai-fsm/domain";
import { DayTimeSummary, type ActivityEntryDto } from "./ActivityTracker";
import { asTimelineEntry, proposeRebalance, type RebalanceAdjustment } from "@/lib/activities/timeline";

// ---------------------------------------------------------------------------
// Time helpers — the page works in one local day; <input type="time"> values
// are "HH:MM" anchored to that day.
// ---------------------------------------------------------------------------

function clockValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isoFromClock(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00`).toISOString();
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function shiftDay(day: string, deltaDays: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toLocaleDateString("en-CA");
}

// ---------------------------------------------------------------------------

type NeedsJobLinkRow = {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string;
  note: string | null;
};

type RowDraft = {
  activity_type: ActivityType;
  start: string;  // HH:MM
  end: string;    // HH:MM
  note: string;
  reason: string;
};

const sheetBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 450 };
const sheetPanel: React.CSSProperties = {
  position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 460,
  background: "var(--bg-card)", borderTop: "1px solid var(--border)",
  borderRadius: "16px 16px 0 0", padding: "var(--space-4)",
  maxHeight: "85vh", overflowY: "auto", boxShadow: "0 -8px 30px rgba(15,23,42,0.18)",
};

function TypeSelect({ value, onChange }: { value: ActivityType; onChange: (t: ActivityType) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ActivityType)}
      style={{ minHeight: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-2)", background: "var(--bg-card)" }}
    >
      {ACTIVITY_TYPES.map((t) => (
        <option key={t} value={t}>{ACTIVITY_TYPE_META[t].emoji} {ACTIVITY_TYPE_META[t].label}</option>
      ))}
    </select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-sm)", fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

const timeInputStyle: React.CSSProperties = {
  minHeight: 38, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-2)", background: "var(--bg-card)",
};

export function TimelineEditor({
  date,
  entries,
  needsJobLink,
}: {
  date: string;
  entries: ActivityEntryDto[];
  needsJobLink: NeedsJobLinkRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [splitId, setSplitId] = useState<string | null>(null);
  const [inserting, setInserting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [rebalanceConfirm, setRebalanceConfirm] = useState<{ body: string } | null>(null);
  const rebalanceResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const sorted = useMemo(
    () => [...entries].sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()),
    [entries]
  );
  const timelineEntries = useMemo(() => sorted.map(asTimelineEntry), [sorted]);

  // Offer to clamp/drop neighbours when a change overlaps them. Declining the
  // offer aborts the save — committing the change without rebalancing would
  // leave overlapping rows that inflate tracked time.
  async function resolveRebalance(change: { id?: string; started_at: string; ended_at: string }):
    Promise<{ proceed: true; rebalance: RebalanceAdjustment[] } | { proceed: false }> {
    const proposed = proposeRebalance(timelineEntries, change);
    if (proposed.length === 0) return { proceed: true, rebalance: [] };
    const drops = proposed.filter((p) => p.delete).length;
    const detail = drops > 0 ? ` (${drops} fully-covered ${drops === 1 ? "entry" : "entries"} will be removed)` : "";
    const body = `This overlaps ${proposed.length} surrounding ${proposed.length === 1 ? "activity" : "activities"}${detail}. Adjust ${proposed.length === 1 ? "it" : "them"} to keep the timeline consistent.`;
    const ok = await new Promise<boolean>((resolve) => {
      rebalanceResolveRef.current = resolve;
      setRebalanceConfirm({ body });
    });
    return ok ? { proceed: true, rebalance: proposed } : { proceed: false };
  }

  async function send(url: string, method: string, body: unknown, okMsg: string): Promise<boolean> {
    setPending(true);
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setPending(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error?.message ?? "Something went wrong");
      return false;
    }
    toast.success(okMsg);
    router.refresh();
    return true;
  }

  async function saveEdit(id: string, draft: RowDraft) {
    const started_at = isoFromClock(date, draft.start);
    const ended_at = isoFromClock(date, draft.end);
    if (new Date(ended_at) <= new Date(started_at)) {
      toast.error("End must be after start");
      return;
    }
    const resolved = await resolveRebalance({ id, started_at, ended_at });
    if (!resolved.proceed) return;
    const ok = await send(`/api/v1/activities/${id}`, "PATCH", {
      activity_type: draft.activity_type, started_at, ended_at,
      note: draft.note || null, reason: draft.reason || null,
      rebalance: resolved.rebalance,
    }, "Activity updated");
    if (ok) setEditId(null);
  }

  function deleteRow(id: string) {
    setDeleteConfirmId(id);
  }

  async function doSplit(row: ActivityEntryDto, boundary: string, secondType: ActivityType) {
    if (!row.ended_at) return;
    const cut = isoFromClock(date, boundary);
    if (new Date(cut) <= new Date(row.started_at) || new Date(cut) >= new Date(row.ended_at)) {
      toast.error("Split time must fall inside the block");
      return;
    }
    const ok = await send(`/api/v1/activities/${row.id}/split`, "POST", {
      segments: [
        // First segment is the original block up to the cut — keep its link/note.
        { activity_type: row.activity_type, ended_at: cut, entity_type: row.entity_type, entity_id: row.entity_id, note: row.note },
        { activity_type: secondType, ended_at: row.ended_at },
      ],
    }, "Activity split");
    if (ok) setSplitId(null);
  }

  async function insertRow(draft: RowDraft) {
    const started_at = isoFromClock(date, draft.start);
    const ended_at = isoFromClock(date, draft.end);
    if (new Date(ended_at) <= new Date(started_at)) {
      toast.error("End must be after start");
      return;
    }
    const resolved = await resolveRebalance({ started_at, ended_at });
    if (!resolved.proceed) return;
    const ok = await send("/api/v1/activities/insert", "POST", {
      activity_type: draft.activity_type, started_at, ended_at,
      note: draft.note || null, reason: draft.reason || null,
      rebalance: resolved.rebalance,
    }, "Activity added");
    if (ok) setInserting(false);
  }

  const editRow = sorted.find((e) => e.id === editId) ?? null;
  const splitRow = sorted.find((e) => e.id === splitId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Day navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => router.push(`/app/timeline?date=${shiftDay(date, -1)}`)}>← Prev</button>
        <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => router.push(`/app/timeline?date=${new Date().toLocaleDateString("en-CA")}`)}>Today</button>
        <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={() => router.push(`/app/timeline?date=${shiftDay(date, 1)}`)}>Next →</button>
        <div style={{ flex: 1 }} />
        <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" disabled={pending} onClick={() => setInserting(true)}>+ Add activity</button>
      </div>

      <DayTimeSummary entries={entries} />

      {needsJobLink.length > 0 ? (
        <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-3)", background: "var(--bg-card)" }}>
          <strong>Needs job link</strong>
          <p style={{ margin: "var(--space-1) 0 var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            These confirmed activities affect job costing but are not attached to a job yet.
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
            {needsJobLink.map((row) => (
              <li key={row.id}>
                {fmtClock(row.started_at)}-{fmtClock(row.ended_at)} {ACTIVITY_TYPE_META[row.activity_type as ActivityType]?.label ?? row.activity_type}
                {row.note ? ` - ${row.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Timeline */}
      {sorted.length === 0 ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>No activities recorded for this day.</p>
      ) : (
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {sorted.map((e) => {
            const meta = ACTIVITY_TYPE_META[e.activity_type as ActivityType];
            const active = e.ended_at === null;
            return (
              <li key={e.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "var(--space-3)", border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`, borderRadius: "var(--radius)", background: "var(--bg-card)" }}>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--fg-muted)", fontSize: "var(--text-sm)", whiteSpace: "nowrap" }}>
                  {fmtClock(e.started_at)}{e.ended_at ? `–${fmtClock(e.ended_at)}` : " · active"}
                </span>
                <span style={{ fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {meta?.emoji} {meta?.label ?? e.activity_type}
                </span>
                {e.note && <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.note}</span>}
                <div style={{ flex: 1 }} />
                {!active && (
                  <>
                    <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={pending} onClick={() => setEditId(e.id)}>Edit</button>
                    <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={pending} onClick={() => setSplitId(e.id)}>Split</button>
                    <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" disabled={pending} onClick={() => deleteRow(e.id)} style={{ color: "#b91c1c" }}>Delete</button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {editRow && (
        <EditSheet
          title="Edit activity"
          initial={{
            activity_type: editRow.activity_type as ActivityType,
            start: clockValue(editRow.started_at),
            end: editRow.ended_at ? clockValue(editRow.ended_at) : clockValue(editRow.started_at),
            note: editRow.note ?? "",
            reason: "",
          }}
          pending={pending}
          onCancel={() => setEditId(null)}
          onSave={(draft) => saveEdit(editRow.id, draft)}
        />
      )}

      {inserting && (
        <EditSheet
          title="Add missing activity"
          initial={{ activity_type: "job_work", start: "08:00", end: "09:00", note: "", reason: "" }}
          pending={pending}
          onCancel={() => setInserting(false)}
          onSave={insertRow}
        />
      )}

      {splitRow && (
        <SplitSheet
          row={splitRow}
          pending={pending}
          onCancel={() => setSplitId(null)}
          onSplit={(boundary, secondType) => doSplit(splitRow, boundary, secondType)}
        />
      )}

      <ConfirmDialog
        open={deleteConfirmId !== null}
        title="Delete activity?"
        body="This will permanently delete this activity. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={async () => {
          const id = deleteConfirmId!;
          setDeleteConfirmId(null);
          await send(`/api/v1/activities/${id}`, "DELETE", {}, "Activity deleted");
        }}
        onCancel={() => setDeleteConfirmId(null)}
        loading={pending}
      />

      <ConfirmDialog
        open={rebalanceConfirm !== null}
        title="Adjust timeline?"
        body={rebalanceConfirm?.body ?? ""}
        confirmLabel="Adjust"
        onConfirm={() => {
          rebalanceResolveRef.current?.(true);
          rebalanceResolveRef.current = null;
          setRebalanceConfirm(null);
        }}
        onCancel={() => {
          rebalanceResolveRef.current?.(false);
          rebalanceResolveRef.current = null;
          setRebalanceConfirm(null);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function EditSheet({ title, initial, pending, onCancel, onSave }: {
  title: string;
  initial: RowDraft;
  pending: boolean;
  onCancel: () => void;
  onSave: (draft: RowDraft) => void;
}) {
  const [draft, setDraft] = useState<RowDraft>(initial);
  return (
    <>
      <div aria-hidden="true" onClick={onCancel} style={sheetBackdrop} />
      <div role="dialog" aria-label={title} style={sheetPanel}>
        <p style={{ margin: "0 0 var(--space-3)", fontWeight: 800, fontSize: "var(--text-lg)" }}>{title}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Field label="Activity">
            <TypeSelect value={draft.activity_type} onChange={(t) => setDraft((d) => ({ ...d, activity_type: t }))} />
          </Field>
          <div style={{ display: "flex", gap: "var(--space-3)" }}>
            <Field label="Start">
              <input type="time" value={draft.start} onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))} style={timeInputStyle} />
            </Field>
            <Field label="End">
              <input type="time" value={draft.end} onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))} style={timeInputStyle} />
            </Field>
          </div>
          <Field label="Note">
            <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} maxLength={500} style={timeInputStyle} />
          </Field>
          <Field label="Reason (optional)">
            <input value={draft.reason} onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))} maxLength={500} placeholder="Why are you correcting this?" style={timeInputStyle} />
          </Field>
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <button type="button" className="p7-btn p7-btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
            <button type="button" className="p7-btn p7-btn-primary" disabled={pending} onClick={() => onSave(draft)}>{pending ? "Saving..." : "Save"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function SplitSheet({ row, pending, onCancel, onSplit }: {
  row: ActivityEntryDto;
  pending: boolean;
  onCancel: () => void;
  onSplit: (boundary: string, secondType: ActivityType) => void;
}) {
  const midpoint = row.ended_at
    ? new Date((new Date(row.started_at).getTime() + new Date(row.ended_at).getTime()) / 2)
    : new Date(row.started_at);
  const [boundary, setBoundary] = useState(`${String(midpoint.getHours()).padStart(2, "0")}:${String(midpoint.getMinutes()).padStart(2, "0")}`);
  const [secondType, setSecondType] = useState<ActivityType>("job_work");
  const firstMeta = ACTIVITY_TYPE_META[row.activity_type as ActivityType];
  return (
    <>
      <div aria-hidden="true" onClick={onCancel} style={sheetBackdrop} />
      <div role="dialog" aria-label="Split activity" style={sheetPanel}>
        <p style={{ margin: "0 0 var(--space-2)", fontWeight: 800, fontSize: "var(--text-lg)" }}>Split activity</p>
        <p style={{ margin: "0 0 var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {firstMeta?.emoji} {firstMeta?.label} stays until the split time; the rest becomes the second activity.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Field label="Split at">
            <input type="time" value={boundary} onChange={(e) => setBoundary(e.target.value)} style={timeInputStyle} />
          </Field>
          <Field label="Second activity">
            <TypeSelect value={secondType} onChange={setSecondType} />
          </Field>
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <button type="button" className="p7-btn p7-btn-ghost" disabled={pending} onClick={onCancel}>Cancel</button>
            <button type="button" className="p7-btn p7-btn-primary" disabled={pending} onClick={() => onSplit(boundary, secondType)}>{pending ? "Splitting..." : "Split"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
