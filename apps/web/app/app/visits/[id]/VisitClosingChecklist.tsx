"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import type { VisitChecklistItem } from "@ai-fsm/domain";

interface Props {
  visitId: string;
  initialItems: VisitChecklistItem[];
  canUpdate: boolean;
}

export function VisitClosingChecklist({ visitId, initialItems, canUpdate }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [itemStates, setItemStates] = useState<Record<string, { checked: boolean; saving: boolean }>>(
    () => {
      const state: Record<string, { checked: boolean; saving: boolean }> = {};
      for (const item of initialItems) {
        state[item.id] = { checked: item.disposition === "ok", saving: false };
      }
      return state;
    }
  );

  const total = initialItems.length;
  const done = Object.values(itemStates).filter((s) => s.checked).length;
  const allDone = done === total && total > 0;

  const patchItem = useCallback(
    async (itemId: string, checked: boolean) => {
      setItemStates((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], saving: true },
      }));

      try {
        const res = await fetch(`/api/v1/visits/${visitId}/checklist/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ disposition: checked ? "ok" : null }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error?.message ?? "Save failed");
          setItemStates((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], checked: !checked, saving: false },
          }));
          return;
        }

        setItemStates((prev) => ({ ...prev, [itemId]: { checked, saving: false } }));
        router.refresh();
      } catch {
        toast.error("Unexpected error saving checklist item");
        setItemStates((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], checked: !checked, saving: false },
        }));
      }
    },
    [visitId, router, toast]
  );

  function handleToggle(itemId: string) {
    if (!canUpdate) return;
    const current = itemStates[itemId];
    if (!current || current.saving) return;
    const next = !current.checked;
    setItemStates((prev) => ({ ...prev, [itemId]: { ...prev[itemId], checked: next } }));
    patchItem(itemId, next);
  }

  return (
    <div>
      {/* Progress */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {done} / {total} steps completed
        </span>
        {allDone && (
          <span style={{ fontSize: "var(--text-sm)", color: "var(--color-success)", fontWeight: 500 }}>
            All done ✓
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {initialItems
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((item) => {
            const state = itemStates[item.id];
            if (!state) return null;
            return (
              <label
                key={item.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  background: state.checked ? "var(--color-success-subtle, #f0fdf4)" : "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  cursor: canUpdate ? "pointer" : "default",
                  opacity: state.saving ? 0.6 : 1,
                  transition: "background 0.15s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={state.checked}
                  onChange={() => handleToggle(item.id)}
                  disabled={!canUpdate || state.saving}
                  style={{ width: 18, height: 18, flexShrink: 0 }}
                />
                <span style={{ fontSize: "var(--text-sm)", flex: 1 }}>{item.label}</span>
                {state.saving && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>saving…</span>
                )}
              </label>
            );
          })}
      </div>
    </div>
  );
}
