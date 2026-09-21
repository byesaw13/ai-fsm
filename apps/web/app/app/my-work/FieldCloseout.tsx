"use client";

import { useState } from "react";
import type { CompletionCriterion } from "@ai-fsm/domain";

export function FieldCloseout({
  workOrderId,
  initialCriteria,
  woStatus,
}: {
  workOrderId: string;
  initialCriteria: CompletionCriterion[];
  woStatus: string;
  hasActiveVisit?: boolean;
}) {
  const [criteria, setCriteria] = useState(initialCriteria);
  const [saving, setSaving] = useState(false);

  async function saveCriteria(next: CompletionCriterion[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/work-orders/${workOrderId}/completion-criteria`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_criteria: next.map((c) => ({ id: c.id, completed: c.completed })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message ?? "Could not save checklist");
        return false;
      }
      setCriteria(json.data?.completion_criteria ?? next);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string) {
    const next = criteria.map((c) =>
      c.id === id ? { ...c, completed: !c.completed } : c,
    );
    await saveCriteria(next);
  }

  if (criteria.length === 0) return null;

  return (
    <div style={{ marginTop: "var(--space-4)" }}>
      {criteria.length > 0 && (
        <>
          <p style={{ margin: "0 0 var(--space-2)", fontWeight: 700, fontSize: "var(--text-sm)" }}>
            Completion checklist
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {criteria.map((c) => (
              <li key={c.id} style={{ padding: "var(--space-1) 0" }}>
                <label style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-start", cursor: saving ? "wait" : "pointer" }}>
                  <input
                    type="checkbox"
                    checked={c.completed}
                    disabled={saving || woStatus === "completed"}
                    onChange={() => toggle(c.id)}
                  />
                  <span>
                    {c.label}
                    {c.required && (
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}> (required)</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {/* Work orders complete as a side effect of visit Done — not a field button. */}
    </div>
  );
}