"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SectionHeader, Textarea, useToast } from "@/components/ui";

type TaskRow = { task_id: string | null; label: string; minutes: number; status: "done" | "partial" | "blocked"; note: string };
type OtherRow = { activity_type: "material_run" | "travel" | "admin"; minutes: number; note: string };
type Draft = { task_time: TaskRow[]; other_time: OtherRow[]; summary: string; reconciliation_note: string; totalMinutes: number };

/**
 * End-of-day recap: narrate the day, AI proposes a per-task time breakdown,
 * review/edit, confirm. Nothing is written until Confirm.
 */
export function DailyRecapPanel({
  jobId,
  workOrderId,
}: {
  jobId: string;
  /** Scope candidates/commits to this assignment (my-work). */
  workOrderId?: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [narration, setNarration] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fmt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

  async function interpret() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/field/daily-recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          work_order_id: workOrderId,
          narration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Could not interpret the recap");
      setDraft(data.data.draft);
      setDate(data.data.date);
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not interpret the recap");
    } finally {
      setBusy(false);
    }
  }

  function editTask(i: number, patch: Partial<TaskRow>) {
    setDraft((d) => (d ? { ...d, task_time: d.task_time.map((t, j) => (j === i ? { ...t, ...patch } : t)) } : d));
  }

  async function confirm() {
    if (!draft || !date) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/field/daily-recap/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          work_order_id: workOrderId,
          date,
          task_entries: draft.task_time,
          other_entries: draft.other_time,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Could not save the recap");
      success(`Recorded ${fmt(data.data.recorded_minutes)} across the day`);
      setDraft(null);
      setNarration("");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not save the recap");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Daily recap" />
      {!draft ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Say what you got done today in plain language — AI turns it into per-task time. Nothing is saved until you confirm.
          </p>
          <Textarea
            id="recap-narration"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            rows={4}
            placeholder="e.g. Replaced the faucet, took about 2 hours. Did the 3 bathroom lights in an hour. Accent wall paint was the wrong color, had to run for a replacement which took the rest of the day."
          />
          <div>
            <Button onClick={interpret} loading={busy} disabled={!narration.trim()}>
              Interpret my day
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{draft.reconciliation_note}</p>
          {draft.task_time.map((t, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap", borderBottom: "1px solid var(--border)", paddingBottom: "var(--space-2)" }}>
              <strong style={{ flex: "1 1 40%", fontSize: "var(--text-sm)" }}>{t.label}</strong>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--text-sm)" }}>
                <input type="number" min={0} value={t.minutes} onChange={(e) => editTask(i, { minutes: parseInt(e.target.value) || 0 })} style={{ width: 70 }} aria-label={`minutes for ${t.label}`} /> min
              </label>
              <select value={t.status} onChange={(e) => editTask(i, { status: e.target.value as TaskRow["status"] })} aria-label={`status for ${t.label}`}>
                <option value="done">Done</option>
                <option value="partial">Partial</option>
                <option value="blocked">Blocked</option>
              </select>
              {t.note && <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", flexBasis: "100%" }}>{t.note}</span>}
            </div>
          ))}
          {draft.other_time.map((o, i) => (
            <div key={`o-${i}`} style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              {o.activity_type.replace("_", " ")} · {fmt(o.minutes)}{o.note ? ` — ${o.note}` : ""}
            </div>
          ))}
          <p style={{ margin: 0, fontWeight: 600 }}>Total: {fmt(draft.totalMinutes)}</p>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button onClick={confirm} loading={busy}>Confirm &amp; record</Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Back</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
