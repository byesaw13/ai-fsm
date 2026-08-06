import type { VisitTimelineEvent } from "@ai-fsm/domain";
import { Timeline } from "@/components/ui";
import type { TimelineEntryData } from "@/components/ui";

export function toTimelineEntryData(event: VisitTimelineEvent): TimelineEntryData {
  return {
    id: event.id,
    timestamp: event.at,
    title: event.title,
    subtitle: event.subtitle ?? undefined,
    status: event.kind === "activity" && event.is_open ? "in_progress" : event.kind,
    isCompleted: !event.is_open && event.kind !== "scheduled",
    badge: event.is_open ? (
      <span className="p7-badge" style={{ background: "#ccfbf1", color: "#0f766e", fontSize: "var(--text-xs)" }}>
        In progress
      </span>
    ) : undefined,
  };
}

export function VisitTimelinePanel({
  events,
  emptyMessage = "No activity linked yet. Start a timer on this visit — it shows up here.",
  className,
}: {
  events: VisitTimelineEvent[];
  emptyMessage?: string;
  className?: string;
}) {
  // Lifecycle-only (scheduled alone) still shows; truly empty is no events at all
  if (events.length === 0) {
    return (
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: 0 }} className={className}>
        {emptyMessage}
      </p>
    );
  }

  const onlyLifecycle =
    events.every((e) => e.kind !== "activity") && events.some((e) => e.kind === "scheduled");
  const activityCount = events.filter((e) => e.kind === "activity").length;

  return (
    <div className={className}>
      <Timeline entries={events.map(toTimelineEntryData)} />
      {onlyLifecycle && activityCount === 0 && (
        <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "var(--space-2)" }}>
          No activity linked yet. Start a timer on this visit — it shows up here.
        </p>
      )}
    </div>
  );
}
