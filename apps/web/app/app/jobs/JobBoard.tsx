"use client";

import Link from "next/link";
import { StatusBadge, PriorityBadge, priorityNumToVariant, priorityLabel } from "@/components/ui";
import type { StatusVariant, PriorityVariant } from "@/components/ui";
import { deriveCustomerStage, CUSTOMER_STAGE_LABELS, CUSTOMER_STAGE_COLORS, SUB_STATUS_LABELS } from "@ai-fsm/domain";

interface JobRow {
  id: string;
  title: string;
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
  groupBy?: "status" | "pipeline_stage";
}

// ---------------------------------------------------------------------------
// JobBoard — Kanban-style pipeline board grouped by job status
//
// Columns are ordered by workflow stage (in_progress first, then scheduled,
// quoted, draft, completed, invoiced). Only columns with jobs are shown.
// Cards are read-only — click goes to the job detail page.
// ---------------------------------------------------------------------------

export function JobBoard({ jobs, statusLabels, statusOrder, groupBy = "status" }: JobBoardProps) {
  // Group jobs by status, only include statuses with jobs
  const grouped: Record<string, JobRow[]> = {};
  for (const status of statusOrder) {
    grouped[status] = [];
  }
  for (const job of jobs) {
    const groupKey = groupBy === "pipeline_stage" ? job.pipeline_stage : job.status;
    if (groupKey && grouped[groupKey]) {
      grouped[groupKey].push(job);
    }
  }

  const activeStatuses = statusOrder.filter((s) => grouped[s].length > 0);

  if (activeStatuses.length === 0) {
    return (
      <p style={{ color: "var(--fg-muted)", padding: "var(--space-6)" }}>
        No jobs to display.
      </p>
    );
  }

  return (
    <div
      data-testid="job-board"
      style={{
        display: "flex",
        gap: "var(--space-4)",
        overflowX: "auto",
        paddingBottom: "var(--space-4)",
        // Allow horizontal scroll on mobile
        WebkitOverflowScrolling: "touch",
      }}
    >
      {activeStatuses.map((status) => (
        <div
          key={status}
          data-testid={`board-column-${status}`}
          style={{
            flex: "0 0 260px",
            minWidth: 220,
          }}
        >
          {/* Column header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              marginBottom: "var(--space-3)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--bg-card)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
            }}
          >
          <span
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: "var(--font-semibold)",
              color: "var(--fg)",
            }}
          >
            {statusLabels[status] ?? status}
          </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: "var(--text-xs)",
                color: "var(--fg-muted)",
                fontWeight: "var(--font-semibold)",
              }}
            >
              {grouped[status].length}
            </span>
          </div>

          {/* Cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {grouped[status].map((job) => (
              <BoardCard key={job.id} job={job} />
            ))}
          </div>
        </div>
      ))}
    </div>
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
      data-testid="board-job-card"
      style={{ textDecoration: "none" }}
    >
      <div
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "var(--space-3)",
          cursor: "pointer",
          transition: "box-shadow 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
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
          {job.title}
          {job.estimate_condition_tier === "yellow" && (
            <span title="Elevated risk estimate" style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: "var(--color-warning)", flexShrink: 0,
            }} />
          )}
          {job.estimate_condition_tier === "red" && (
            <span title="Complex — review required" style={{
              display: "inline-block", width: 8, height: 8, borderRadius: "50%",
              background: "var(--color-danger)", flexShrink: 0,
            }} />
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
              Next visit {new Date(job.next_visit_start).toLocaleDateString(undefined, {
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
