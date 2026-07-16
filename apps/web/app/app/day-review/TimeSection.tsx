import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";
import { BUSINESS_TIMEZONE } from "@/lib/operations/business-day";
import type { DayReviewPayload } from "@/lib/day-review/queries";

type Segment = DayReviewPayload["segments"][number];
type Gap = DayReviewPayload["gaps"][number];
type TimeEntry = DayReviewPayload["timeEntries"][number];

// Server-rendered: format in the business timezone, not the container's UTC,
// so a 9am-ET entry doesn't display as 1pm.
function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS_TIMEZONE,
  });
}

function activityLabel(type: string): { emoji: string; label: string } {
  const meta = ACTIVITY_TYPE_META[type as ActivityType];
  return meta ? { emoji: meta.emoji, label: meta.label } : { emoji: "•", label: type };
}

export function TimeSection({
  timeEntries,
  segments,
  gaps,
}: {
  timeEntries: TimeEntry[];
  segments: Segment[];
  gaps: Gap[];
}) {
  const items = [
    ...segments.map((s) => ({ type: "segment" as const, at: s.startedAt, data: s })),
    ...gaps.map((g) => ({ type: "gap" as const, at: g.startsAt, data: g })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Time</h2>

      {timeEntries.length > 0 && (
        <div className="space-y-2 mb-4">
          {timeEntries.map((e) => {
            const { emoji, label } = activityLabel(e.activityType);
            return (
              <div key={e.id} className="border rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {emoji} {label}
                    {e.entityLabel ? <span className="text-muted-foreground font-normal"> · {e.entityLabel}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmt(e.startedAt)} – {fmt(e.endedAt)} · {e.durationMinutes} min
                  </span>
                </div>
                {e.note ? <p className="text-xs text-muted-foreground mt-1">{e.note}</p> : null}
              </div>
            );
          })}
        </div>
      )}

      {timeEntries.length > 0 && (segments.length > 0 || gaps.length > 0) && (
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Locations &amp; gaps</h3>
      )}

      {items.length === 0 ? (
        timeEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No time tracked for this day.</p>
        ) : null
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            if (item.type === "gap") {
              const g = item.data as Gap;
              return (
                <div key={`gap-${i}`} className="border border-dashed rounded-lg p-3 bg-muted/30">
                  <p className="text-sm text-muted-foreground">
                    {fmt(g.startsAt)} – {fmt(g.endsAt)} · {g.durationMinutes} min untracked
                  </p>
                </div>
              );
            }
            const s = item.data as Segment;
            return (
              <div
                key={s.id}
                className={`border rounded-lg p-3 ${s.status === "confirmed" ? "opacity-60" : ""} ${s.isLikelyNoise ? "border-yellow-300" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium capitalize">
                    {s.kind} · {s.placeLabel ?? s.zone ?? "Unknown"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fmt(s.startedAt)} – {fmt(s.endedAt)}
                  </span>
                </div>
                {s.isLikelyNoise && s.status !== "confirmed" && (
                  <p className="text-xs text-yellow-600 mt-1">Likely noise</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
