import type { ActivityCategory } from "@ai-fsm/domain";

/**
 * Pure day-summary math over activity entries: totals, category breakdown,
 * and missing-time (gap) detection. Used by the Daily Command Center's
 * End Day card. No I/O.
 */

export type DayEntry = {
  activity_type: string;
  category: string;
  started_at: string;          // ISO
  ended_at: string | null;     // null = active
};

export interface DayGap {
  start: string;  // ISO
  end: string;    // ISO
  minutes: number;
}

export interface DaySummary {
  totalMinutes: number;
  byCategory: Partial<Record<ActivityCategory, number>>;
  byType: Record<string, number>;
  gaps: DayGap[];
  largestGap: DayGap | null;
  unaccountedMinutes: number;
}

const MIN_GAP_MINUTES = 10; // ignore tiny seams between switches

export function summarizeDay(entries: DayEntry[], nowIso?: string): DaySummary {
  const now = nowIso ? new Date(nowIso).getTime() : Date.now();
  const sorted = [...entries].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  let totalMinutes = 0;
  const byCategory: Partial<Record<ActivityCategory, number>> = {};
  const byType: Record<string, number> = {};

  for (const e of sorted) {
    const start = new Date(e.started_at).getTime();
    const end = e.ended_at ? new Date(e.ended_at).getTime() : now;
    const mins = Math.max(0, Math.round((end - start) / 60000));
    totalMinutes += mins;
    byCategory[e.category as ActivityCategory] =
      (byCategory[e.category as ActivityCategory] ?? 0) + mins;
    byType[e.activity_type] = (byType[e.activity_type] ?? 0) + mins;
  }

  // Gaps between consecutive entries (coverage-based: track the furthest end
  // seen so overlapping/backfilled segments don't create phantom gaps).
  const gaps: DayGap[] = [];
  let coveredUntil = sorted.length ? new Date(sorted[0].started_at).getTime() : now;
  for (const e of sorted) {
    const start = new Date(e.started_at).getTime();
    const end = e.ended_at ? new Date(e.ended_at).getTime() : now;
    if (start > coveredUntil) {
      const mins = Math.round((start - coveredUntil) / 60000);
      if (mins >= MIN_GAP_MINUTES) {
        gaps.push({
          start: new Date(coveredUntil).toISOString(),
          end: new Date(start).toISOString(),
          minutes: mins,
        });
      }
    }
    coveredUntil = Math.max(coveredUntil, end);
  }

  const largestGap = gaps.reduce<DayGap | null>(
    (best, g) => (best === null || g.minutes > best.minutes ? g : best),
    null
  );
  const unaccountedMinutes = gaps.reduce((s, g) => s + g.minutes, 0);

  return { totalMinutes, byCategory, byType, gaps, largestGap, unaccountedMinutes };
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
