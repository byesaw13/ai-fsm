import { describe, it, expect } from "vitest";
import { detectGaps, preSelectCandidates, checkMileageDelta } from "./day-review";

describe("detectGaps", () => {
  const seg = (startedAt: string, endedAt: string) => ({ startedAt, endedAt });

  it("returns empty when segments cover the full day", () => {
    expect(
      detectGaps(
        [seg("2026-07-01T08:00:00Z", "2026-07-01T12:00:00Z"), seg("2026-07-01T12:05:00Z", "2026-07-01T17:00:00Z")],
        [],
        30,
      ),
    ).toEqual([]);
  });

  it("detects a gap between two segments when > minDwellMinutes", () => {
    const gaps = detectGaps(
      [seg("2026-07-01T08:00:00Z", "2026-07-01T10:00:00Z"), seg("2026-07-01T12:00:00Z", "2026-07-01T15:00:00Z")],
      [],
      30,
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].durationMinutes).toBe(120);
    expect(gaps[0].startsAt).toBe("2026-07-01T10:00:00Z");
    expect(gaps[0].endsAt).toBe("2026-07-01T12:00:00Z");
  });

  it("ignores gaps shorter than minDwellMinutes", () => {
    expect(
      detectGaps(
        [seg("2026-07-01T08:00:00Z", "2026-07-01T10:00:00Z"), seg("2026-07-01T10:10:00Z", "2026-07-01T12:00:00Z")],
        [],
        30,
      ),
    ).toEqual([]);
  });

  it("ignores gaps covered by an activity entry", () => {
    const gaps = detectGaps(
      [seg("2026-07-01T08:00:00Z", "2026-07-01T10:00:00Z"), seg("2026-07-01T12:00:00Z", "2026-07-01T14:00:00Z")],
      [seg("2026-07-01T10:00:00Z", "2026-07-01T12:00:00Z")],
      30,
    );
    expect(gaps).toEqual([]);
  });
});

describe("preSelectCandidates", () => {
  const c = (id: string, score: number) => ({ id, confidenceScore: score });

  it("selects candidates at or above threshold", () => {
    const result = preSelectCandidates([c("a", 80), c("b", 70), c("c", 60)], 70);
    expect(result.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("returns empty when nothing meets threshold", () => {
    expect(preSelectCandidates([c("a", 50)], 70)).toEqual([]);
  });
});

describe("checkMileageDelta", () => {
  it("flags when GPS differs from odometer by more than 20%", () => {
    const result = checkMileageDelta(100, 130);
    expect(result.flagged).toBe(true);
    expect(result.deltaPercent).toBe(30);
  });

  it("does not flag when within 20%", () => {
    const result = checkMileageDelta(100, 115);
    expect(result.flagged).toBe(false);
    expect(result.deltaPercent).toBe(15);
  });

  it("returns flagged=false and null deltaPercent when odometer is null", () => {
    const result = checkMileageDelta(null, 50);
    expect(result.flagged).toBe(false);
    expect(result.deltaPercent).toBeNull();
  });
});
