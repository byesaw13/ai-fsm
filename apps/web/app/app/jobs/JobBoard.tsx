"use client";

import Link from "next/link";
import { StatusBadge, PriorityBadge, priorityNumToVariant, priorityLabel } from "@/components/ui";
import type { StatusVariant, PriorityVariant } from "@/components/ui";

interface JobRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  client_name: string | null;
  scheduled_start?: string | null;
}

interface JobBoardProps {
  jobs: JobRow[];
  statusLabels: Record<string, string>;
  statusOrder: string[];
}

// ---------------------------------------------------------------------------
// JobBoard — Kanban-style pipeline board grouped by job status
//
// Columns are ordered by workflow stage (in_progress first, then scheduled,
// quoted, draft, completed, invoiced). Only columns with jobs are shown.
// Cards are read-only — click goes to the job detail page.
// ---------------------------------------------------------------------------

export function JobBoard({ jobs, statusLabels, statusOrder }: JobBoardProps) {
  // Group jobs by status, only include statuses with jobs
  const grouped: Record<string, JobRow[]> = {};
  for (const status of statusOrder) {
    grouped[status] = [];
  }
  for (const job of jobs) {
    if (grouped[job.status]) {
      grouped[job.status].push(job);
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
            <StatusBadge variant={status as StatusVariant}>
              {statusLabels[status] ?? status}
            </StatusBadge>
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
          }}
        >
          {job.title}
        </p>
        {job.client_name && (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            {job.client_name}
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
          {job.scheduled_start && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              {new Date(job.scheduled_start).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
