import type { ActivityType } from "@ai-fsm/domain";

/**
 * Pure timeline-correction math over activity entries: splitting a block into
 * contiguous segments, proposing minimal neighbour adjustments to keep the day
 * chronological ("rebalancing"), and detecting overlaps. No I/O — the API
 * routes own the transaction, audit, and persistence.
 *
 * All times are ISO strings; helpers convert to epoch millis internally and
 * return ISO strings so callers never juggle Date objects.
 */

export interface TimelineEntry {
  id: string;
  activity_type: string;
  started_at: string;        // ISO
  ended_at: string | null;   // null = still active
}

/** A completed block we are about to split. */
export interface SplitTarget {
  started_at: string;        // ISO
  ended_at: string;          // ISO (split only applies to completed blocks)
  activity_type: ActivityType;
}

/** One segment a split produces, ready to become an activity_entries row. */
export interface SplitSegment {
  activity_type: ActivityType;
  started_at: string;        // ISO
  ended_at: string;          // ISO
}

/** A proposed change to one neighbour so the timeline stays consistent. */
export interface RebalanceAdjustment {
  id: string;
  started_at?: string;       // ISO
  ended_at?: string;         // ISO
}

const ms = (iso: string): number => new Date(iso).getTime();
const iso = (millis: number): string => new Date(millis).toISOString();

/**
 * Split a completed block at one or more interior boundary times into N
 * contiguous segments that exactly cover [started_at, ended_at] with no gaps or
 * overlaps. The first segment keeps the original's type; callers re-type the
 * later segments afterwards (the common case is one block becoming
 * Travel → Job Work → Travel).
 *
 * Boundaries must be strictly inside the block and strictly increasing.
 * Throws on any boundary at/outside the bounds or out of order.
 */
export function splitSegments(target: SplitTarget, boundaries: string[]): SplitSegment[] {
  const start = ms(target.started_at);
  const end = ms(target.ended_at);
  if (!(end > start)) {
    throw new Error("Block end must be after its start");
  }
  if (boundaries.length === 0) {
    throw new Error("Split needs at least one boundary");
  }

  const cuts = boundaries.map(ms);
  let prev = start;
  for (const c of cuts) {
    if (!(c > prev) || !(c < end)) {
      throw new Error("Split boundaries must be strictly increasing and inside the block");
    }
    prev = c;
  }

  const points = [start, ...cuts, end];
  const segments: SplitSegment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      activity_type: target.activity_type,
      started_at: iso(points[i]),
      ended_at: iso(points[i + 1]),
    });
  }
  return segments;
}

/**
 * Given the day's existing entries and a single change (an edit that moved a
 * block's bounds, or a newly inserted block), propose the minimal set of
 * neighbour adjustments that remove any overlap the change introduced.
 *
 * Strategy: clamp the entry immediately before the change's start (pull its
 * `ended_at` back to the change's start) and the entry immediately after the
 * change's end (push its `started_at` forward to the change's end), but only
 * when they actually overlap the change. The changed entry itself is excluded
 * by `changeId` so an edit doesn't try to adjust the row being edited.
 *
 * Returns at most one adjustment per neighbour. Callers present this as the
 * "Adjust surrounding activities?" offer and apply it in the same transaction.
 */
export function proposeRebalance(
  entries: TimelineEntry[],
  change: { id?: string; started_at: string; ended_at: string },
): RebalanceAdjustment[] {
  const changeStart = ms(change.started_at);
  const changeEnd = ms(change.ended_at);
  const adjustments: RebalanceAdjustment[] = [];

  for (const e of entries) {
    if (change.id != null && e.id === change.id) continue;
    if (e.ended_at == null) continue; // never reshape the active block
    const eStart = ms(e.started_at);
    const eEnd = ms(e.ended_at);
    if (eEnd <= changeStart || eStart >= changeEnd) continue; // no overlap

    if (eStart < changeStart && eEnd > changeStart) {
      // Neighbour starts before and runs into the change → pull its end back.
      adjustments.push({ id: e.id, ended_at: change.started_at });
    } else if (eStart < changeEnd && eEnd > changeEnd) {
      // Neighbour starts inside the change and runs past it → push start forward.
      adjustments.push({ id: e.id, started_at: change.ended_at });
    } else {
      // Neighbour is fully engulfed by the change; clamp it to a zero-width
      // seam at the change start so the caller can drop or review it.
      adjustments.push({ id: e.id, started_at: change.started_at, ended_at: change.started_at });
    }
  }
  return adjustments;
}

export interface ChronologyIssue {
  kind: "overlap" | "reversed";
  a: string; // entry id
  b: string; // entry id (overlap) or same id (reversed bounds)
}

/**
 * Validate that completed entries are ordered and non-overlapping. The active
 * entry (ended_at null) is ignored. Returns every issue found (empty = clean).
 */
export function validateChronology(entries: TimelineEntry[]): ChronologyIssue[] {
  const issues: ChronologyIssue[] = [];
  const completed = entries
    .filter((e) => e.ended_at != null)
    .sort((x, y) => ms(x.started_at) - ms(y.started_at));

  for (const e of completed) {
    if (!(ms(e.ended_at as string) > ms(e.started_at))) {
      issues.push({ kind: "reversed", a: e.id, b: e.id });
    }
  }

  for (let i = 0; i < completed.length - 1; i++) {
    const cur = completed[i];
    const next = completed[i + 1];
    if (ms(cur.ended_at as string) > ms(next.started_at)) {
      issues.push({ kind: "overlap", a: cur.id, b: next.id });
    }
  }
  return issues;
}
