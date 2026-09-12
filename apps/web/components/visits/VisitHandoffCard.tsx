import { formatBusinessDate, formatBusinessTime } from "@/lib/time/business-tz";
import type { VisitBriefing } from "@/lib/visits/briefing";

export function VisitHandoffCard({ briefing }: { briefing: VisitBriefing }) {
  return (
    <div
      data-testid="visit-handoff-card"
      style={{
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-card)",
        marginBottom: "var(--space-4)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>On this job</div>
      {briefing.scheduledStart ? (
        <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginBottom: 8 }}>
          Next: {formatBusinessDate(briefing.scheduledStart)} {formatBusinessTime(briefing.scheduledStart)}
        </div>
      ) : null}
      {briefing.firstUp ? (
        <p style={{ margin: "0 0 8px" }}>
          <strong>First up:</strong> {briefing.firstUp}
        </p>
      ) : null}
      {briefing.previousNotes ? (
        <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
          <strong>
            Yesterday{briefing.previousAssigneeName ? ` (${briefing.previousAssigneeName})` : ""}:
          </strong>{" "}
          {briefing.previousNotes}
        </p>
      ) : (
        <p style={{ margin: "0 0 8px", color: "var(--fg-muted)" }}>No day log from last visit</p>
      )}
      {briefing.priorNotes.length > 1 ? (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Already done</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {briefing.priorNotes.map((row) => (
              <li key={row.date} style={{ whiteSpace: "pre-wrap" }}>
                {formatBusinessDate(row.date)} — {row.notes}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
