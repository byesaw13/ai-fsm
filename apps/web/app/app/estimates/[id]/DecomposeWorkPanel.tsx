"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, SectionHeader, useToast } from "@/components/ui";

type Task = { label: string; required: boolean };
type WO = { title: string; scope: string; tasks: Task[] };

/**
 * AI task decomposition: propose work orders + task checklists from the
 * estimate, review, then create them. Nothing is created until "Create".
 */
export function DecomposeWorkPanel({ estimateId }: { estimateId: string }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [draft, setDraft] = useState<WO[] | null>(null);
  const [busy, setBusy] = useState(false);

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
      if (!res.ok) throw new Error(data.error?.message ?? "Could not create the work orders");
      success(`Created ${data.data.count} work order${data.data.count !== 1 ? "s" : ""} with tasks`);
      setDraft(null);
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not create the work orders");
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
            Propose work orders and discrete task checklists from this estimate — the units captured time baselines against. Review before creating.
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
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <Button onClick={apply} loading={busy}>Create {draft.length} work order{draft.length !== 1 ? "s" : ""}</Button>
            <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>Discard</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
