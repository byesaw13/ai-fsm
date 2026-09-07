import Link from "next/link";
import type { Route } from "next";
import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";
import { Card, EmptyState, SectionHeader } from "@/components/ui";
import type { ActivityEntryDto } from "@/lib/my-work/field-day-types";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function typeLabel(activityType: string): string {
  const meta = ACTIVITY_TYPE_META[activityType as ActivityType];
  return meta?.label ?? activityType.replace(/_/g, " ");
}

export function TodayTimeline({
  entries,
  showTrackingLink,
}: {
  entries: ActivityEntryDto[];
  showTrackingLink: boolean;
}) {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  return (
    <Card id="today-timeline" data-testid="today-timeline" style={{ marginBottom: "var(--space-4)" }}>
      <SectionHeader
        title="Today so far"
        count={sorted.length}
        action={
          showTrackingLink ? (
            <Link href={"/app/timeline" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Tracking →
            </Link>
          ) : null
        }
      />
      {sorted.length === 0 ? (
        <EmptyState title="Nothing logged yet" description="Clock in and the day's blocks show up here." />
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {sorted.map((entry) => (
            <li
              key={entry.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span>
                <strong>{typeLabel(entry.activity_type)}</strong>
                {entry.note ? <span style={{ color: "var(--fg-muted)" }}> · {entry.note}</span> : null}
              </span>
              <span style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
                {fmtTime(entry.started_at)}
                {entry.ended_at ? `–${fmtTime(entry.ended_at)}` : " · now"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
