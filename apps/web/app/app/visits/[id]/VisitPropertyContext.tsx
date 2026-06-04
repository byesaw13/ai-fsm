import Link from "next/link";
import type { Route } from "next";
import {
  ISSUE_SEVERITY_COLORS,
  NOTE_SOURCE_DISPLAY,
  formatContextDate,
} from "./visit-execution-helpers";

export type PropertyIssueContextRow = {
  id: string;
  title: string;
  severity: string;
  area: string;
  occurrence_count: number;
};

export type PropertyNoteContextRow = {
  id: string;
  body: string;
  source: string;
  created_at: string;
};

export type LastServiceRow = {
  id: string;
  job_title: string;
  completed_at: string;
};

interface Props {
  propertyId: string;
  propertyAddress: string | null;
  issues: PropertyIssueContextRow[];
  pinnedNotes: PropertyNoteContextRow[];
  lastService: LastServiceRow | null;
}

export function VisitPropertyContext({
  propertyId,
  propertyAddress,
  issues,
  pinnedNotes,
  lastService,
}: Props) {
  const hasContent = issues.length > 0 || pinnedNotes.length > 0 || lastService !== null;
  if (!hasContent) return null;

  return (
    <div
      style={{
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        background: "var(--bg-subtle)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
      data-testid="visit-property-context"
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Property Context
        </span>
        <Link
          href={`/app/properties/${propertyId}` as Route}
          style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textDecoration: "underline" }}
        >
          {propertyAddress ?? "View property"} →
        </Link>
      </div>

      {/* Last service */}
      {lastService ? (
        <div style={{ fontSize: "var(--text-sm)" }}>
          <span style={{ color: "var(--fg-muted)", marginRight: 6 }}>Last service:</span>
          <Link
            href={`/app/visits/${lastService.id}` as Route}
            style={{ fontWeight: 500, color: "var(--fg-primary)", textDecoration: "none" }}
          >
            {lastService.job_title}
          </Link>
          <span style={{ color: "var(--fg-muted)", marginLeft: 6, fontSize: "var(--text-xs)" }}>
            {formatContextDate(lastService.completed_at)}
          </span>
        </div>
      ) : (
        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          No previous service on file.
        </div>
      )}

      {/* Open issues */}
      {issues.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Open issues
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {issues.map((issue) => {
              const sev = ISSUE_SEVERITY_COLORS[issue.severity] ?? ISSUE_SEVERITY_COLORS.minor;
              return (
                <div
                  key={issue.id}
                  style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}
                >
                  <span
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      color: sev.fg,
                      background: sev.bg,
                      padding: "1px 7px",
                      borderRadius: 99,
                      flexShrink: 0,
                    }}
                  >
                    {issue.severity}
                  </span>
                  <span style={{ fontWeight: 500 }}>{issue.title}</span>
                  <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                    {issue.area}
                    {issue.occurrence_count > 1 && ` · ${issue.occurrence_count}×`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pinned notes */}
      {pinnedNotes.length > 0 && (
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
            Pinned notes
          </div>
          {pinnedNotes.map((note) => (
            <div
              key={note.id}
              style={{
                padding: "var(--space-2) var(--space-3)",
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "var(--radius-sm)",
                marginBottom: 4,
              }}
            >
              <div style={{ fontSize: "var(--text-sm)", marginBottom: 2 }}>
                {note.body.length > 160 ? `${note.body.slice(0, 157)}…` : note.body}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                {NOTE_SOURCE_DISPLAY[note.source] ?? note.source} · {formatContextDate(note.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
