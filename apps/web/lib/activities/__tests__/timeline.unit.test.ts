import { describe, it, expect } from "vitest";
import { splitSegments, proposeRebalance, validateChronology, type TimelineEntry } from "../timeline";

const T = (h: number, m = 0) => `2026-06-11T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

describe("splitSegments", () => {
  it("splits a block at one boundary into two contiguous segments", () => {
    const segs = splitSegments(
      { started_at: T(7), ended_at: T(12), activity_type: "travel" },
      [T(8)]
    );
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ started_at: T(7), ended_at: T(8), activity_type: "travel" });
    expect(segs[1]).toMatchObject({ started_at: T(8), ended_at: T(12), activity_type: "travel" });
  });

  it("splits at multiple boundaries with no gaps or overlaps", () => {
    const segs = splitSegments(
      { started_at: T(7), ended_at: T(12), activity_type: "travel" },
      [T(8), T(11)]
    );
    expect(segs.map((s) => [s.started_at, s.ended_at])).toEqual([
      [T(7), T(8)],
      [T(8), T(11)],
      [T(11), T(12)],
    ]);
  });

  it("rejects a boundary outside the block", () => {
    expect(() => splitSegments({ started_at: T(7), ended_at: T(12), activity_type: "travel" }, [T(13)])).toThrow();
  });

  it("rejects out-of-order boundaries", () => {
    expect(() => splitSegments({ started_at: T(7), ended_at: T(12), activity_type: "travel" }, [T(10), T(9)])).toThrow();
  });

  it("rejects zero boundaries", () => {
    expect(() => splitSegments({ started_at: T(7), ended_at: T(12), activity_type: "travel" }, [])).toThrow();
  });
});

describe("proposeRebalance", () => {
  const entries: TimelineEntry[] = [
    { id: "a", activity_type: "travel", started_at: T(7), ended_at: T(12) },
    { id: "b", activity_type: "admin", started_at: T(13), ended_at: T(15) },
  ];

  it("pulls a preceding neighbour's end back when a change overlaps it", () => {
    // Insert job_work 8:00–11:00 → overlaps travel(7–12); travel should end at 8.
    const adj = proposeRebalance(entries, { started_at: T(8), ended_at: T(11) });
    expect(adj).toContainEqual({ id: "a", ended_at: T(8) });
  });

  it("pushes a following neighbour's start forward when a change runs into it", () => {
    // Insert 12:30–14:00 → overlaps admin(13–15); admin should start at 14.
    const adj = proposeRebalance(entries, { started_at: T(12, 30), ended_at: T(14) });
    expect(adj).toContainEqual({ id: "b", started_at: T(14) });
  });

  it("proposes dropping a neighbour fully engulfed by the change", () => {
    // A change spanning 6:00–16:00 fully covers travel(7–12); it can't be
    // clamped to a valid duration, so it must be dropped.
    const adj = proposeRebalance(entries, { started_at: T(6), ended_at: T(16) });
    const dropped = adj.find((x) => x.id === "a");
    // Dropped, with no (zero-width) bounds that would violate the duration check.
    expect(dropped).toEqual({ id: "a", delete: true });
    expect(dropped?.started_at).toBeUndefined();
    expect(dropped?.ended_at).toBeUndefined();
  });

  it("returns nothing when the change does not overlap anyone", () => {
    expect(proposeRebalance(entries, { started_at: T(12), ended_at: T(13) })).toEqual([]);
  });

  it("never adjusts the entry being edited (changeId excluded)", () => {
    const adj = proposeRebalance(entries, { id: "a", started_at: T(7), ended_at: T(12, 30) });
    expect(adj.find((x) => x.id === "a")).toBeUndefined();
  });

  it("ignores the active (open) entry", () => {
    const withActive: TimelineEntry[] = [...entries, { id: "c", activity_type: "job_work", started_at: T(16), ended_at: null }];
    const adj = proposeRebalance(withActive, { started_at: T(16, 30), ended_at: T(17) });
    expect(adj.find((x) => x.id === "c")).toBeUndefined();
  });
});

describe("validateChronology", () => {
  it("returns no issues for an ordered, non-overlapping day", () => {
    const entries: TimelineEntry[] = [
      { id: "a", activity_type: "travel", started_at: T(7), ended_at: T(8) },
      { id: "b", activity_type: "job_work", started_at: T(8), ended_at: T(11) },
    ];
    expect(validateChronology(entries)).toEqual([]);
  });

  it("flags an overlap between consecutive entries", () => {
    const entries: TimelineEntry[] = [
      { id: "a", activity_type: "travel", started_at: T(7), ended_at: T(9) },
      { id: "b", activity_type: "job_work", started_at: T(8), ended_at: T(11) },
    ];
    expect(validateChronology(entries)).toContainEqual({ kind: "overlap", a: "a", b: "b" });
  });

  it("flags a reversed block (end before start)", () => {
    const entries: TimelineEntry[] = [
      { id: "a", activity_type: "travel", started_at: T(9), ended_at: T(8) },
    ];
    expect(validateChronology(entries)).toContainEqual({ kind: "reversed", a: "a", b: "a" });
  });

  it("ignores the active entry", () => {
    const entries: TimelineEntry[] = [
      { id: "a", activity_type: "job_work", started_at: T(7), ended_at: null },
    ];
    expect(validateChronology(entries)).toEqual([]);
  });
});
