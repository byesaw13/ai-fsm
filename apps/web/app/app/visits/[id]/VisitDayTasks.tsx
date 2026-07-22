"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";

export type DayTask = {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  status: string;
  work_order_title: string | null;
};

type Selectable = {
  id: string;
  label: string;
  required: boolean;
  status: string;
  work_order_title: string | null;
};

/**
 * Plan tasks on any field day (including past visits), mark done (locked),
 * or started-not-finished (creates a remainder task for what is left).
 */
export function VisitDayTasks({
  visitId,
  initialTasks,
  canToggle,
}: {
  visitId: string;
  initialTasks: DayTask[];
  canToggle: boolean;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [selectable, setSelectable] = useState<Selectable[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingPlan, setEditingPlan] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSelectable = useCallback(async () => {
    const res = await fetch(`/api/v1/visits/${visitId}/tasks?selectable=1`);
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setTasks(j.data?.tasks ?? []);
    setSelectable(j.data?.selectable ?? []);
    setSelectedIds((j.data?.tasks ?? []).map((t: DayTask) => t.id));
  }, [visitId]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  async function openPlanner() {
    setError(null);
    setEditingPlan(true);
    try {
      await refreshSelectable();
    } catch {
      setError("Could not load tasks to plan");
    }
  }

  function toggleSelect(id: string, locked: boolean) {
    if (locked) return;
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function savePlan() {
    setSavingPlan(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: selectedIds }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error?.message ?? "Could not save day plan");
        return;
      }
      setTasks(j.data?.tasks ?? []);
      setEditingPlan(false);
      router.refresh();
    } finally {
      setSavingPlan(false);
    }
  }

  async function markDone(taskId: string) {
    if (!canToggle) return;
    setBusyId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "done", task_id: taskId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error?.message ?? "Could not mark done");
        return;
      }
      setTasks(j.data?.tasks ?? []);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function markPartial(taskId: string, label: string) {
    if (!canToggle) return;
    const remainder = window.prompt(
      `Started but not finished:\n“${label}”\n\nWhat is left to do? (creates a new follow-up task)`,
      "",
    );
    if (remainder == null) return; // cancelled
    if (!remainder.trim()) {
      setError("Describe what is left to do, or cancel.");
      return;
    }
    setBusyId(taskId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "partial",
          task_id: taskId,
          remainder_label: remainder.trim(),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error?.message ?? "Could not save partial progress");
        return;
      }
      setTasks(j.data?.tasks ?? []);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const done = tasks.filter((t) => t.completed || t.status === "done").length;
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100);

  // Planner options: selectable open/partial + already planned (even if done, shown locked)
  const plannedIds = new Set(tasks.map((t) => t.id));
  const plannerRows: Array<Selectable & { locked: boolean; planned: boolean }> = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    seen.add(t.id);
    plannerRows.push({
      id: t.id,
      label: t.label,
      required: t.required,
      status: t.status,
      work_order_title: t.work_order_title,
      locked: t.completed || t.status === "done",
      planned: true,
    });
  }
  for (const s of selectable) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    plannerRows.push({
      ...s,
      locked: false,
      planned: plannedIds.has(s.id),
    });
  }

  return (
    <div data-testid="visit-day-tasks">
      {error && (
        <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      )}

      {tasks.length > 0 && (
        <>
          <div style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            {done} of {tasks.length} done · {percent}%
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: "var(--border)",
              marginBottom: "var(--space-3)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${percent}%`,
                background: "var(--accent)",
                borderRadius: 999,
              }}
            />
          </div>
        </>
      )}

      {!editingPlan && (
        <>
          {tasks.length === 0 ? (
            <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              No tasks planned for this day yet (including past days).
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {tasks.map((t) => {
                const isDone = t.completed || t.status === "done";
                const isPartial = t.status === "partial";
                return (
                  <li
                    key={t.id}
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid var(--border)",
                      opacity: isDone ? 0.75 : 1,
                    }}
                  >
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <input
                        type="checkbox"
                        checked={isDone}
                        disabled
                        readOnly
                        aria-label={isDone ? `${t.label} (done)` : t.label}
                        title={isDone ? "Done — locked" : "Use buttons to update"}
                        style={{ marginTop: 3 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: "var(--text-sm)",
                            textDecoration: isDone ? "line-through" : undefined,
                            fontWeight: 500,
                          }}
                        >
                          {t.label}
                          {isPartial && (
                            <span style={{ marginLeft: 8, fontSize: "var(--text-xs)", color: "var(--warning, #b45309)" }}>
                              Started · not finished
                            </span>
                          )}
                          {isDone && (
                            <span style={{ marginLeft: 8, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                              Done
                            </span>
                          )}
                        </div>
                        {!isDone && canToggle && (
                          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              loading={busyId === t.id}
                              onClick={() => markDone(t.id)}
                            >
                              Mark done
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              loading={busyId === t.id}
                              onClick={() => markPartial(t.id, t.label)}
                            >
                              Started, not finished…
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canToggle && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <Button type="button" size="sm" variant="secondary" onClick={openPlanner}>
                {tasks.length === 0 ? "Plan tasks for this day" : "Edit day task plan"}
              </Button>
            </div>
          )}
        </>
      )}

      {editingPlan && (
        <div data-testid="visit-day-task-planner">
          <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            Select tasks for this field day. <strong>Done</strong> tasks cannot be selected.
          </p>
          {plannerRows.length === 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              No open tasks on this project. Add deliverables via AI break-down or the work order first.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {plannerRows.map((t) => {
                const locked = t.locked;
                const checked = selectedIds.includes(t.id);
                return (
                  <li key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                    <label
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "flex-start",
                        cursor: locked ? "not-allowed" : "pointer",
                        fontSize: "var(--text-sm)",
                        opacity: locked ? 0.55 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked || locked}
                        disabled={locked || savingPlan}
                        onChange={() => toggleSelect(t.id, locked)}
                      />
                      <span>
                        {t.label}
                        {locked && (
                          <span style={{ color: "var(--fg-muted)" }}> — done (locked)</span>
                        )}
                        {t.status === "partial" && !locked && (
                          <span style={{ color: "var(--warning, #b45309)" }}> — started</span>
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: "var(--space-3)" }}>
            <Button type="button" size="sm" loading={savingPlan} onClick={savePlan}>
              Save day plan
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={savingPlan}
              onClick={() => setEditingPlan(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
