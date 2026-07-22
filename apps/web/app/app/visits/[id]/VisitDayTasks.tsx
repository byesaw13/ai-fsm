"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type DayTask = {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
  work_order_title: string | null;
};

/**
 * Planned tasks for this field day — check off to update project progress.
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
  const [busyId, setBusyId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        No tasks planned for this day. When scheduling, select tasks under the work order — or
        complete work via Daily Recap on My Work.
      </p>
    );
  }

  const done = tasks.filter((t) => t.completed).length;
  const percent = Math.round((done / tasks.length) * 100);

  async function toggle(taskId: string, completed: boolean) {
    if (!canToggle) return;
    setBusyId(taskId);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, completed: !completed }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(j.error?.message ?? "Could not update task");
        return;
      }
      setTasks(j.data?.tasks ?? tasks);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div data-testid="visit-day-tasks">
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
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tasks.map((t) => (
          <li key={t.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
            <label
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                cursor: canToggle ? "pointer" : "default",
                fontSize: "var(--text-sm)",
              }}
            >
              <input
                type="checkbox"
                checked={t.completed}
                disabled={!canToggle || busyId === t.id}
                onChange={() => toggle(t.id, t.completed)}
              />
              <span style={{ textDecoration: t.completed ? "line-through" : undefined }}>
                {t.label}
                {!t.required && (
                  <span style={{ color: "var(--fg-muted)" }}> (optional)</span>
                )}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
