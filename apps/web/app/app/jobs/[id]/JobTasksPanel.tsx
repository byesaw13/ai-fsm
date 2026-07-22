"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { JobTaskRow } from "@/lib/work-orders/job-tasks";

export type JobTasksPanelProps = {
  jobId: string;
  progress: {
    total: number;
    required_total: number;
    done: number;
    required_done: number;
    percent: number;
  };
  tasks: JobTaskRow[];
  canToggle: boolean;
};

/**
 * Project-level task checklist + progress bar so multi-day jobs show
 * "where we stand" without opening each work order.
 */
export function JobTasksPanel({ jobId: _jobId, progress, tasks, canToggle }: JobTasksPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (tasks.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        No field tasks yet. Estimate line items (T&M budgets, materials allowances) are pricing — not
        progress. On an approved estimate, use <strong>Break down the work (AI)</strong> or add real
        deliverable tasks on the work order (e.g. “Replace faucet”).
      </p>
    );
  }

  async function toggle(taskId: string, workOrderId: string, completed: boolean) {
    if (!canToggle) return;
    setBusyId(taskId);
    try {
      const res = await fetch(`/api/v1/work-orders/${workOrderId}/completion-criteria`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completion_criteria: [{ id: taskId, completed: !completed }],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error?.message ?? "Could not update task");
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const label =
    progress.required_total > 0
      ? `${progress.required_done} of ${progress.required_total} required`
      : `${progress.done} of ${progress.total}`;

  return (
    <div data-testid="job-tasks-panel">
      <div style={{ marginBottom: "var(--space-3)" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
            fontSize: "var(--text-sm)",
          }}
        >
          <span style={{ fontWeight: 600 }}>Progress</span>
          <span style={{ color: "var(--fg-muted)" }}>
            {label} · {progress.percent}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 10,
            borderRadius: 999,
            background: "var(--border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress.percent}%`,
              background: progress.percent >= 100 ? "var(--success, #16a34a)" : "var(--accent)",
              borderRadius: 999,
              transition: "width 0.25s ease",
            }}
          />
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {tasks.map((t) => (
          <li
            key={t.id}
            style={{
              display: "flex",
              gap: "var(--space-2)",
              alignItems: "flex-start",
              padding: "6px 0",
              borderBottom: "1px solid var(--border)",
              opacity: t.completed ? 0.75 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={t.completed}
              disabled={!canToggle || busyId === t.id}
              onChange={() => toggle(t.id, t.work_order_id, t.completed)}
              aria-label={t.label}
              style={{ marginTop: 3 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  textDecoration: t.completed ? "line-through" : undefined,
                  fontWeight: t.required ? 500 : 400,
                }}
              >
                {t.label}
                {!t.required && (
                  <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                    {" "}
                    (optional)
                  </span>
                )}
              </div>
              {t.work_order_title && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  {t.work_order_title}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
