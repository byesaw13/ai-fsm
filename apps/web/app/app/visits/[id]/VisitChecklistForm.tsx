"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import type { VisitChecklistItem, ChecklistDisposition } from "@ai-fsm/domain";
import { CHECKLIST_DISPOSITION_LABELS, CHECKLIST_SECTIONS } from "@ai-fsm/domain";

interface Props {
  visitId: string;
  initialItems: VisitChecklistItem[];
  canUpdate: boolean;
}

type ItemState = {
  disposition: ChecklistDisposition | null;
  note: string;
  saving: boolean;
  error: string;
};

const DISPOSITION_OPTIONS: { value: ChecklistDisposition; label: string }[] = [
  { value: "ok",       label: CHECKLIST_DISPOSITION_LABELS.ok },
  { value: "fix_now",  label: CHECKLIST_DISPOSITION_LABELS.fix_now },
  { value: "monitor",  label: CHECKLIST_DISPOSITION_LABELS.monitor },
  { value: "optional", label: CHECKLIST_DISPOSITION_LABELS.optional },
  { value: "refer",    label: CHECKLIST_DISPOSITION_LABELS.refer },
];

// CSS class per disposition for color-coding
const DISPOSITION_CLASS: Record<ChecklistDisposition, string> = {
  ok:       "p7-badge p7-badge-status-completed",
  fix_now:  "p7-badge p7-badge-status-overdue",
  monitor:  "p7-badge p7-badge-status-quoted",
  optional: "p7-badge p7-badge-status-draft",
  refer:    "p7-badge p7-badge-status-cancelled",
};

function buildInitialState(items: VisitChecklistItem[]): Record<string, ItemState> {
  const state: Record<string, ItemState> = {};
  for (const item of items) {
    state[item.id] = {
      disposition: (item.disposition as ChecklistDisposition | null) ?? null,
      note: item.note ?? "",
      saving: false,
      error: "",
    };
  }
  return state;
}

export function VisitChecklistForm({ visitId, initialItems, canUpdate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [itemStates, setItemStates] = useState<Record<string, ItemState>>(
    () => buildInitialState(initialItems)
  );

  // Group items by section in SOP order
  const itemsBySection = CHECKLIST_SECTIONS.reduce<Record<string, VisitChecklistItem[]>>(
    (acc, section) => {
      acc[section] = initialItems
        .filter((i) => i.section === section)
        .sort((a, b) => a.sort_order - b.sort_order);
      return acc;
    },
    {} as Record<string, VisitChecklistItem[]>
  );

  // Progress: count items with a non-null disposition
  const reviewed = Object.values(itemStates).filter((s) => s.disposition !== null).length;
  const total = initialItems.length;
  const progressPct = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  const patchItem = useCallback(
    async (
      itemId: string,
      patch: { disposition?: ChecklistDisposition | null; note?: string | null }
    ) => {
      setItemStates((prev) => ({
        ...prev,
        [itemId]: { ...prev[itemId], saving: true, error: "" },
      }));

      try {
        const res = await fetch(`/api/v1/visits/${visitId}/checklist/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const message = data.error?.message ?? "Save failed";
          setItemStates((prev) => ({
            ...prev,
            [itemId]: { ...prev[itemId], saving: false, error: message },
          }));
          toast.error(message);
          return;
        }

        setItemStates((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], saving: false, error: "" },
        }));
        router.refresh();
      } catch {
        const message = "Unexpected error saving item";
        setItemStates((prev) => ({
          ...prev,
          [itemId]: { ...prev[itemId], saving: false, error: message },
        }));
        toast.error(message);
      }
    },
    [visitId, router, toast]
  );

  function handleDispositionChange(itemId: string, value: string) {
    const disposition = value === "" ? null : (value as ChecklistDisposition);
    setItemStates((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], disposition },
    }));
    patchItem(itemId, { disposition });
  }

  function handleNoteBlur(itemId: string) {
    const note = itemStates[itemId]?.note ?? "";
    patchItem(itemId, { note: note || null });
  }

  return (
    <div data-testid="visit-checklist-form">
      {/* Progress bar */}
      <div className="p7-checklist-progress" style={{ marginBottom: "var(--space-4)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)" }}>
          <span className="p7-label">Progress</span>
          <span className="p7-label" data-testid="checklist-progress-label">
            {reviewed} / {total} reviewed ({progressPct}%)
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: "var(--color-border)",
            overflow: "hidden",
          }}
        >
          <div
            data-testid="checklist-progress-bar"
            style={{
              height: "100%",
              width: `${progressPct}%`,
              background: progressPct === 100 ? "var(--color-success)" : "var(--color-primary)",
              transition: "width 0.2s ease",
            }}
          />
        </div>
      </div>

      {/* Sections */}
      {CHECKLIST_SECTIONS.map((section) => {
        const sectionItems = itemsBySection[section] ?? [];
        if (sectionItems.length === 0) return null;

        return (
          <div key={section} style={{ marginBottom: "var(--space-6)" }}>
            <h3
              style={{
                fontWeight: 600,
                fontSize: "var(--font-size-sm)",
                color: "var(--color-text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "var(--space-3)",
                paddingBottom: "var(--space-1)",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              {section}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {sectionItems.map((item) => {
                const state = itemStates[item.id];
                if (!state) return null;

                return (
                  <div
                    key={item.id}
                    data-testid={`checklist-item-${item.item_key}`}
                    style={{
                      padding: "var(--space-3)",
                      borderRadius: "var(--radius-md)",
                      background: "var(--color-surface)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "var(--space-3)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-2)" }}>
                          <span style={{ fontWeight: 500, fontSize: "var(--font-size-sm)" }}>
                            {item.label}
                          </span>
                          {state.disposition && (
                            <span className={DISPOSITION_CLASS[state.disposition]}>
                              {CHECKLIST_DISPOSITION_LABELS[state.disposition]}
                            </span>
                          )}
                          {state.saving && (
                            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                              saving…
                            </span>
                          )}
                        </div>

                        {canUpdate ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                            <select
                              id={`disposition-${item.id}`}
                              className="p7-select"
                              value={state.disposition ?? ""}
                              onChange={(e) => handleDispositionChange(item.id, e.target.value)}
                              disabled={state.saving}
                              aria-label={`Disposition for ${item.label}`}
                              data-testid={`disposition-select-${item.item_key}`}
                            >
                              <option value="">— not reviewed —</option>
                              {DISPOSITION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>

                            <textarea
                              className="p7-textarea"
                              value={state.note}
                              onChange={(e) =>
                                setItemStates((prev) => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], note: e.target.value },
                                }))
                              }
                              onBlur={() => handleNoteBlur(item.id)}
                              disabled={state.saving}
                              rows={2}
                              placeholder="Add note (optional)…"
                              aria-label={`Note for ${item.label}`}
                              data-testid={`note-textarea-${item.item_key}`}
                            />

                            {state.error && (
                              <p className="p7-field-error" data-testid={`item-error-${item.item_key}`}>
                                {state.error}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            {state.note && (
                              <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: "var(--space-1)" }}>
                                {state.note}
                              </p>
                            )}
                            {!state.disposition && !state.note && (
                              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-tertiary)" }}>
                                Not reviewed
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
