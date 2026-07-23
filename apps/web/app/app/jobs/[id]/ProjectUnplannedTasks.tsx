"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import {
  mergeTaskOntoDayPlan,
  type UnplannedTask,
  type VisitPlanDay,
} from "@/lib/jobs/project-board";

/**
 * Open work not yet planned on any field day — assign to a day from the project page.
 */
export function ProjectUnplannedTasks({
  tasks,
  planDays,
  canPlan,
}: {
  tasks: UnplannedTask[];
  planDays: VisitPlanDay[];
  canPlan: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayByTask, setSelectedDayByTask] = useState<Record<string, string>>(() => {
    const def = planDays[0]?.visitId ?? "";
    const init: Record<string, string> = {};
    for (const t of tasks) init[t.id] = def;
    return init;
  });

  const dayOptions = useMemo(
    () =>
      planDays.map((d) => ({
        value: d.visitId,
        label: `${d.label}${d.status === "completed" ? " (done)" : ""}`,
      })),
    [planDays],
  );

  if (tasks.length === 0) {
    return (
      <p
        data-testid="project-unplanned-empty"
        style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
      >
        All open tasks are planned on a field day (or there are no open tasks).
      </p>
    );
  }

  if (planDays.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        Schedule a work day first, then plan tasks onto it from here.
      </p>
    );
  }

  async function planTask(task: UnplannedTask) {
    const visitId = selectedDayByTask[task.id] || planDays[0]?.visitId;
    if (!visitId || !canPlan) return;
    const day = planDays.find((d) => d.visitId === visitId);
    if (!day) return;

    setBusyId(task.id);
    setError(null);
    try {
      // Prefer server state for merge (other tabs may have planned)
      let existing = day.plannedTaskIds;
      const getRes = await fetch(`/api/v1/visits/${visitId}/tasks`);
      if (getRes.ok) {
        const j = await getRes.json().catch(() => ({}));
        const serverIds = (j.data?.tasks ?? []).map((t: { id: string }) => t.id);
        if (Array.isArray(serverIds)) existing = serverIds;
      }
      const taskIds = mergeTaskOntoDayPlan(existing, task.id);
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_ids: taskIds }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error?.message ?? "Could not plan task on that day");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not plan task on that day");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="project-unplanned-tasks">
      <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        Open work not assigned to a day yet. Pick a field day and add it to that day&apos;s plan.
      </p>
      {error ? (
        <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: "var(--text-sm)" }}>
          {error}
        </p>
      ) : null}
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tasks.map((t) => (
          <li
            key={t.id}
            data-testid={`unplanned-task-${t.id}`}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-2)",
              alignItems: "center",
              padding: "10px 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{t.label}</div>
              {t.work_order_title ? (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                  {t.work_order_title}
                  {t.status === "partial" ? " · started" : ""}
                </div>
              ) : null}
            </div>
            {canPlan ? (
              <>
                <select
                  aria-label={`Day for ${t.label}`}
                  value={selectedDayByTask[t.id] ?? dayOptions[0]?.value ?? ""}
                  onChange={(e) =>
                    setSelectedDayByTask((prev) => ({ ...prev, [t.id]: e.target.value }))
                  }
                  disabled={busyId === t.id}
                  style={{
                    fontSize: "var(--text-sm)",
                    padding: "6px 8px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--fg)",
                    maxWidth: 220,
                  }}
                >
                  {dayOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  loading={busyId === t.id}
                  onClick={() => planTask(t)}
                >
                  Add to day
                </Button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
