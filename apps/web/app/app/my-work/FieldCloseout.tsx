"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompletionCriterion } from "@ai-fsm/domain";
import { allRequiredCriteriaMet } from "@ai-fsm/domain";
import { Button } from "@/components/ui";

export function FieldCloseout({
  workOrderId,
  initialCriteria,
  woStatus,
  hasActiveVisit,
}: {
  workOrderId: string;
  initialCriteria: CompletionCriterion[];
  woStatus: string;
  hasActiveVisit: boolean;
}) {
  const router = useRouter();
  const [criteria, setCriteria] = useState(initialCriteria);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const canComplete =
    woStatus !== "completed" &&
    woStatus !== "cancelled" &&
    !hasActiveVisit &&
    allRequiredCriteriaMet(criteria);

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

  async function completeWorkOrder() {
    if (!confirm("Mark this work order complete?")) return;
    setCompleting(true);
    try {
      const res = await fetch(`/api/v1/work-orders/${workOrderId}/complete`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error?.message ?? "Could not complete work order");
        return;
      }
      router.refresh();
      router.push("/app/my-work");
    } finally {
      setCompleting(false);
    }
  }

  if (criteria.length === 0 && !canComplete) return null;

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
      {canComplete && (
        <Button
          type="button"
          variant="secondary"
          loading={completing}
          onClick={completeWorkOrder}
          style={{ marginTop: criteria.length > 0 ? "var(--space-3)" : undefined }}
        >
          Complete Work Order
        </Button>
      )}
    </div>
  );
}