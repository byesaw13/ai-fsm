import type { ActivityType } from "@ai-fsm/domain";

/**
 * Pure timeline-correction math over activity entries: splitting a block into
 * contiguous segments, proposing minimal neighbour adjustments to keep the day
 * chronological ("rebalancing"). No I/O — the API routes own the transaction.
 *
 * All times are ISO strings; helpers convert to epoch millis internally and
 * return ISO strings so callers never juggle Date objects.
 */

export interface TimelineEntry {
  id: string;
  activity_type: string;
  started_at: string; // ISO
  ended_at: string | null; // null = still active
}

/** Narrow a DTO-like row to the fields proposeRebalance needs. */
export function asTimelineEntry(e: {
  id: string;
  activity_type: string;
  started_at: string;
  ended_at: string | null;
}): TimelineEntry {
  return {
    id: e.id,
    activity_type: e.activity_type,
    started_at: e.started_at,
    ended_at: e.ended_at,
  };
}

/** A completed block we are about to split. */
export interface SplitTarget {
  started_at: string;
  ended_at: string;
  activity_type: ActivityType;
}

/** One segment a split produces, ready to become an activity_entries row. */
export interface SplitSegment {
  activity_type: ActivityType;
  started_at: string;
  ended_at: string;
}

/**
 * A proposed change to one neighbour so the timeline stays consistent: either
 * clamp its bounds, close an open activity, split a spanning block (trim + tail),
 * or — when the change fully engulfs a completed block — drop it (`delete`).
 */
export interface RebalanceAdjustment {
  id: string;
  started_at?: string;
  ended_at?: string;
  delete?: boolean;
  /**
   * When a completed entry spans both sides of the change (starts before and
   * ends after), trim the head via ended_at and re-insert the trailing portion
   * after the change so soft auto-rebalance does not silently drop time.
   */
  preserve_tail?: {
    started_at: string;
    ended_at: string;
  };
}

const ms = (iso: string): number => new Date(iso).getTime();
const iso = (millis: number): string => new Date(millis).toISOString();

export function rebalanceHasDeletes(adjustments: RebalanceAdjustment[]): boolean {
  return adjustments.some((a) => a.delete === true);
}

/**
 * Split a completed block at one or more interior boundary times into N
 * contiguous segments that exactly cover [started_at, ended_at].
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
 * Propose neighbour adjustments so `change` does not overlap existing entries.
 *
 * Open activities (ended_at null) are first-class:
 * - started before change → close at change.started_at ("stop the clock")
 * - started inside change → push open start to change.ended_at
 *
 * Completed blocks use trim/delete as before.
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
    const eStart = ms(e.started_at);
    const isOpen = e.ended_at == null;
    const eEnd = isOpen ? Number.POSITIVE_INFINITY : ms(e.ended_at as string);
    if (eEnd <= changeStart || eStart >= changeEnd) continue; // no overlap

    if (isOpen) {
      if (eStart < changeStart) {
        // Active work started before the new block → stop it when the block starts.
        adjustments.push({ id: e.id, ended_at: change.started_at });
      } else {
        // Active work started during the new block → reopen after it ends.
        adjustments.push({ id: e.id, started_at: change.ended_at });
      }
      continue;
    }

    if (eStart < changeStart && eEnd > changeEnd) {
      // Spans the whole change: keep head before + tail after (do not drop 13–14 when
      // inserting 12–13 into an 11–14 block).
      adjustments.push({
        id: e.id,
        ended_at: change.started_at,
        preserve_tail: { started_at: change.ended_at, ended_at: e.ended_at as string },
      });
    } else if (eStart < changeStart && eEnd > changeStart) {
      // Runs into the change from before but ends inside/at it → trim end only.
      adjustments.push({ id: e.id, ended_at: change.started_at });
    } else if (eStart < changeEnd && eEnd > changeEnd) {
      // Starts inside the change and runs past it → push start forward.
      adjustments.push({ id: e.id, started_at: change.ended_at });
    } else {
      adjustments.push({ id: e.id, delete: true });
    }
  }
  return adjustments;
}
