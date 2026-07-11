"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { StatusBadge, PriorityBadge, priorityNumToVariant, priorityLabel } from "@/components/ui";
import type { PriorityVariant } from "@/components/ui";
import {
  deriveCustomerStage,
  CUSTOMER_STAGE_LABELS,
  CUSTOMER_STAGE_COLORS,
  SUB_STATUS_LABELS,
} from "@ai-fsm/domain";
import { StatusKanbanBoard } from "@/components/kanban/StatusKanbanBoard";
import { canJobBoardDrop } from "@/lib/kanban/board-transitions";

interface JobRow {
  id: string;
  title: string;
  job_number?: string | null;
  status: string;
  priority: number;
  client_name: string | null;
  next_visit_start?: string | null;
  has_approved_estimate?: boolean;
  has_active_visit?: boolean;
  sub_status?: string | null;
  pipeline_stage?: string;
  pipeline_stage_label?: string;
  next_action?: string;
  estimate_condition_tier?: string | null;
}

interface JobBoardProps {
  jobs: JobRow[];
  statusLabels: Record<string, string>;
  statusOrder: string[];
  /** When true, cards can be dragged between status columns. */
  canDrag?: boolean;
}

export function JobBoard({
  jobs,
  statusLabels,
  statusOrder,
  canDrag = false,
}: JobBoardProps) {
  const router = useRouter();

  const onMove = useCallback(
    async (itemId: string, _from: string, toStatus: string) => {
      try {
        const res = await fetch(`/api/v1/jobs/${itemId}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: toStatus }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          return {
            ok: false,
            message: data?.error?.message ?? "Could not update project status",
          };
        }
        router.refresh();
        return { ok: true };
      } catch {
        return { ok: false, message: "Network error — status not updated" };
      }
    },
    [router],
  );

  const columns = statusOrder.map((id) => ({
    id,
    label: statusLabels[id] ?? id,
  }));

  return (
    <StatusKanbanBoard
      columns={columns}
      items={jobs}
      canDrag={canDrag}
      canDrop={canJobBoardDrop}
      onMove={onMove}
      showEmptyColumns={canDrag}
      testId="job-board"
      cardTestId="board-job-card"
      renderCard={(job) => <BoardCard job={job} />}
    />
  );
}

function BoardCard({ job }: { job: JobRow }) {
  const pv: PriorityVariant | null = priorityNumToVariant(job.priority);
  const pl: string = priorityLabel(job.priority);
  const stage = deriveCustomerStage({
    jobStatus: job.status,
    hasApprovedEstimate: job.has_approved_estimate,
    hasActiveVisit: job.has_active_visit,
  });
  const stageColor = CUSTOMER_STAGE_COLORS[stage];

  return (
    <Link
      href={`/app/jobs/${job.id}`}
      style={{ textDecoration: "none", display: "block" }}
      draggable={false}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-3)",
          transition: "box-shadow 0.15s, border-color 0.15s",
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: "var(--font-semibold)",
            fontSize: "var(--text-sm)",
            color: "var(--fg)",
            marginBottom: "var(--space-1)",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
          }}
        >
          {job.job_number && (
            <span style={{ color: "var(--fg-muted)", fontWeight: 400, fontSize: "var(--text-xs)" }}>
              {job.job_number}
            </span>
          )}
          {job.title}
          {job.estimate_condition_tier === "yellow" && (
            <span
              title="Elevated risk estimate"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--color-warning)",
                flexShrink: 0,
              }}
            />
          )}
          {job.estimate_condition_tier === "red" && (
            <span
              title="Complex — review required"
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--color-danger)",
                flexShrink: 0,
              }}
            />
          )}
        </p>
        {job.client_name && (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            {job.client_name}
          </p>
        )}
        {job.next_action && (
          <p
            style={{
              margin: "var(--space-2) 0 0",
              fontSize: "var(--text-xs)",
              color: "var(--accent)",
              fontWeight: 600,
            }}
          >
            {job.next_action}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            marginTop: "var(--space-2)",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {pv && <PriorityBadge variant={pv}>{pl}</PriorityBadge>}
          {job.sub_status && (
            <StatusBadge variant="overdue">
              {SUB_STATUS_LABELS[job.sub_status] ?? job.sub_status}
            </StatusBadge>
          )}
          {job.next_visit_start && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              Next visit{" "}
              {new Date(job.next_visit_start).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              background: stageColor.bg,
              color: stageColor.fg,
              borderRadius: 8,
              padding: "1px 6px",
            }}
          >
            {job.pipeline_stage_label ?? CUSTOMER_STAGE_LABELS[stage]}
          </span>
        </div>
      </div>
    </Link>
  );
}
