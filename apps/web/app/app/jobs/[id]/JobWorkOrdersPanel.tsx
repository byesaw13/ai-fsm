"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import {
  WORK_ORDER_STATUS_LABELS,
  type WorkOrderUiStatus,
} from "@ai-fsm/domain";
import { Button, LinkButton, useToast } from "@/components/ui";
import { canDeleteUnusedWorkOrder } from "@/lib/work-orders/can-delete-unused";

export interface JobWorkOrderRow {
  id: string;
  title: string;
  status: string;
  visit_count: number;
  active_visit_count: number;
  /** Deliverable tasks on this WO (optional for older callers) */
  task_total?: number;
  task_open?: number;
}

interface JobWorkOrdersPanelProps {
  jobId: string;
  workOrders: JobWorkOrderRow[];
  canManage: boolean;
}

export function JobWorkOrdersPanel({ jobId, workOrders, canManage }: JobWorkOrdersPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function splitWorkOrder(woId: string, title: string) {
    const newTitle = window.prompt("Title for the new work order:", `${title} (split)`);
    if (!newTitle?.trim()) return;
    setSplittingId(woId);
    try {
      const res = await fetch(`/api/v1/work-orders/${woId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not split work order");
        return;
      }
      toast.success("Work order split");
      router.refresh();
    } finally {
      setSplittingId(null);
    }
  }

  async function deleteWorkOrder(woId: string, title: string) {
    if (
      !window.confirm(
        `Delete work order “${title}”? Only unused draft/cancelled packets with no field days can be removed.`,
      )
    ) {
      return;
    }
    setDeletingId(woId);
    try {
      const res = await fetch(`/api/v1/work-orders/${woId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error?.message ?? "Could not delete work order");
        return;
      }
      toast.success("Work order deleted");
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {workOrders.map((wo) => {
        const statusLabel =
          WORK_ORDER_STATUS_LABELS[wo.status as WorkOrderUiStatus] ?? wo.status;
        const derived =
          wo.active_visit_count > 0 && wo.status !== "dispatched" && wo.status !== "completed"
            ? " · In Progress"
            : "";
        const taskTotal = wo.task_total ?? 0;
        const taskOpen = wo.task_open ?? 0;
        const taskDone = Math.max(0, taskTotal - taskOpen);
        const emptyCalendar =
          wo.visit_count > 0 && taskOpen === 0 && taskTotal === 0;
        const showDelete = canManage && canDeleteUnusedWorkOrder(wo);
        const showScheduleSplit = canManage && wo.status !== "draft" && wo.status !== "cancelled";
        return (
          <div
            key={wo.id}
            data-testid={`job-work-order-row-${wo.id}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) 0",
              borderBottom: "1px solid var(--border)",
              opacity: wo.status === "cancelled" ? 0.75 : 1,
            }}
          >
            <div>
              <Link
                href={`/app/work-orders/${wo.id}` as Route}
                style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
              >
                {wo.title}
              </Link>
              <p style={{ margin: "2px 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                {statusLabel}
                {derived}
                {wo.visit_count > 0
                  ? ` · ${wo.visit_count} visit${wo.visit_count !== 1 ? "s" : ""}`
                  : " · no field days"}
                {taskTotal > 0
                  ? ` · ${taskDone}/${taskTotal} tasks (${taskOpen} open)`
                  : emptyCalendar
                    ? " · no tasks"
                    : ""}
              </p>
            </div>
            {(showScheduleSplit || showDelete) && (
              <div style={{ display: "flex", gap: "var(--space-1)", flexShrink: 0 }}>
                {showScheduleSplit && (
                  <>
                    <LinkButton
                      href={`/app/jobs/${jobId}/visits/new?work_order_id=${wo.id}` as Route}
                      variant="ghost"
                      size="sm"
                    >
                      Schedule
                    </LinkButton>
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={splittingId === wo.id}
                      onClick={() => splitWorkOrder(wo.id, wo.title)}
                    >
                      Split
                    </Button>
                  </>
                )}
                {showDelete && (
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deletingId === wo.id}
                    data-testid={`delete-work-order-${wo.id}`}
                    onClick={() => deleteWorkOrder(wo.id, wo.title)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
