"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SectionHeader, useToast } from "@/components/ui";

type Task = { label: string; required: boolean };
type WO = { title: string; scope: string; tasks: Task[] };

/**
 * AI task decomposition: propose a task checklist from the estimate (optionally
 * grouped by area for review). Apply creates one work order with all tasks —
 * product default is one schedulable packet per project.
 */
export function DecomposeWorkPanel({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [draft, setDraft] = useState<WO[] | null>(null);
  const [busy, setBusy] = useState(false);

  const taskCount = draft?.reduce((n, wo) => n + wo.tasks.length, 0) ?? 0;

  async function propose() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/decompose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Could not propose a breakdown");
      setDraft(data.data.draft.work_orders);
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not propose a breakdown");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/decompose/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ work_orders: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? "Could not create the work order");
      const tasks = data.data.task_count ?? taskCount;
      success(`Created 1 work order with ${tasks} task${tasks !== 1 ? "s" : ""}`);
      setDraft(null);
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not create the work order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Break down the work (AI)" />
      {!draft ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Propose a discrete task checklist from this estimate — the units time baselines capture against.
            Creates <strong>one work order</strong> on the project (areas are tasks, not extra work orders). Review before creating.
          </p>
          <div>
            <Button onClick={propose} loading={busy}>Propose breakdown</Button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {draft.map((wo, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "var(--space-2)" }}>
              <strong>{wo.title}</strong>
              {wo.scope && <p style={{ margin: "2px 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{wo.scope}</p>}
              <ul style={{ margin: "var(--space-1) 0 0", paddingLeft: "var(--space-4)", fontSize: "var(--text-sm)" }}>
                {wo.tasks.map((t, j) => (
                  <li key={j}>{t.label}{!t.required ? " (optional)" : ""}</li>
                ))}
              </ul>
            </div>
          ))}
          {draft.length > 1 ? (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              These groups will be merged into <strong>one work order</strong> with {taskCount} tasks (area names prefixed on labels).
            </p>
          ) : null}
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button onClick={apply} loading={busy}>
              Create work order ({taskCount} task{taskCount !== 1 ? "s" : ""})
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
