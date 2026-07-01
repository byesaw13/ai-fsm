import type { DayReviewPayload } from "@/lib/day-review/queries";

type Segment = DayReviewPayload["segments"][number];
type Gap = DayReviewPayload["gaps"][number];

function fmt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TimeSection({ segments, gaps }: { segments: Segment[]; gaps: Gap[] }) {
  const items = [
    ...segments.map((s) => ({ type: "segment" as const, at: s.startedAt, data: s })),
    ...gaps.map((g) => ({ type: "gap" as const, at: g.startsAt, data: g })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Time</h2>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No segments captured for this day.</p>
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
