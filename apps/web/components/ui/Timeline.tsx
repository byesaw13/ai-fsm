import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

// ---------------------------------------------------------------------------
// Timeline — ordered activity / schedule list (Pattern 3)
// ---------------------------------------------------------------------------

export interface TimelineEntryData {
  id: string;
  timestamp: string;
  title: string;
  subtitle?: string;
  status?: string;
  badge?: ReactNode;
  href?: string;
  isCompleted?: boolean;
}

interface TimelineProps {
  entries: TimelineEntryData[];
  emptyMessage?: string;
  action?: ReactNode;
  className?: string;
}

/** Maps a visit status to the timeline dot CSS modifier */
function getDotClass(status: string | undefined): string {
  if (!status) return "";
  return `p7-timeline-dot-${status}`;
}

/** Timeline — renders an ordered list of schedule/activity entries */
export function Timeline({
  entries,
  emptyMessage = "No entries yet.",
  action,
  className = "",
}: TimelineProps) {
  const isEmpty = entries.length === 0 && !action;

  if (isEmpty) {
    return (
      <div className={`p7-timeline ${className}`}>
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className={`p7-timeline ${className}`}>
      {entries.map((entry, idx) => {
        const isLast = idx === entries.length - 1 && !action;
        const dotClass = `p7-timeline-dot ${getDotClass(entry.status)}`;
        const lineClass = `p7-timeline-line ${
          entry.isCompleted ? "p7-timeline-line-dashed" : ""
        }`;

        const content = (
          <div className="p7-timeline-content">
            <div className="p7-timeline-title">{entry.title}</div>
            {entry.subtitle && (
              <div className="p7-timeline-subtitle">{entry.subtitle}</div>
            )}
            {entry.badge && (
              <div style={{ marginTop: "var(--space-1)" }}>{entry.badge}</div>
            )}
          </div>
        );

        return (
          <div
            key={entry.id}
            className={`p7-timeline-entry ${entry.isCompleted ? "p7-timeline-completed" : ""}`}
          >
            <div className="p7-timeline-connector">
              <div className={dotClass} />
              {!isLast && <div className={lineClass} />}
            </div>
            {entry.href ? (
              <Link href={entry.href as Route} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit", display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                {content}
                <div className="p7-timeline-timestamp">
                  {formatTimestamp(entry.timestamp)}
                </div>
              </Link>
            ) : (
              <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "var(--space-3)", alignItems: "flex-start" }}>
                {content}
                <div className="p7-timeline-timestamp">
                  {formatTimestamp(entry.timestamp)}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {action && (
        <div className="p7-timeline-action">
          <div className="p7-timeline-action-connector">
            <div className="p7-timeline-action-dot" />
          </div>
          <div style={{ flex: 1 }}>{action}</div>
        </div>
      )}
    </div>
  );
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
}
