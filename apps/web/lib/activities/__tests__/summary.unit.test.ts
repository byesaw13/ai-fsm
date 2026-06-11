import { describe, it, expect } from "vitest";
import { summarizeDay, formatMinutes } from "../summary";

const T = (h: number, m = 0) => `2026-06-11T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

describe("summarizeDay", () => {
  it("totals minutes and groups by category and type", () => {
    const s = summarizeDay(
      [
        { activity_type: "job_work", category: "revenue", started_at: T(8), ended_at: T(10) },
        { activity_type: "travel", category: "revenue", started_at: T(10), ended_at: T(10, 30) },
        { activity_type: "invoicing", category: "office", started_at: T(10, 30), ended_at: T(11) },
      ],
      T(12)
    );
    expect(s.totalMinutes).toBe(180);
    expect(s.byCategory.revenue).toBe(150);
    expect(s.byCategory.office).toBe(30);
    expect(s.byType.job_work).toBe(120);
    expect(s.unaccountedMinutes).toBe(0);
  });

  it("counts an active entry up to now", () => {
    const s = summarizeDay(
      [{ activity_type: "job_work", category: "revenue", started_at: T(9), ended_at: null }],
      T(9, 45)
    );
    expect(s.totalMinutes).toBe(45);
  });

  it("detects gaps >= 10 minutes and finds the largest", () => {
    const s = summarizeDay(
      [
        { activity_type: "job_work", category: "revenue", started_at: T(8), ended_at: T(9) },
        // 15m gap
        { activity_type: "travel", category: "revenue", started_at: T(9, 15), ended_at: T(9, 45) },
        // 90m gap
        { activity_type: "admin", category: "office", started_at: T(11, 15), ended_at: T(11, 30) },
      ],
      T(12)
    );
    expect(s.gaps).toHaveLength(2);
    expect(s.unaccountedMinutes).toBe(105);
    expect(s.largestGap?.minutes).toBe(90);
    expect(s.largestGap?.start).toBe(T(9, 45));
  });

  it("ignores tiny switch seams (<10m) and tolerates overlapping backfill", () => {
    const s = summarizeDay(
      [
        { activity_type: "job_work", category: "revenue", started_at: T(8), ended_at: T(9) },
        // 4m seam
        { activity_type: "travel", category: "revenue", started_at: T(9, 4), ended_at: T(10) },
        // overlapping backfilled segment inside earlier coverage
        { activity_type: "admin", category: "office", started_at: T(8, 30), ended_at: T(8, 45) },
      ],
      T(10)
    );
    expect(s.gaps).toHaveLength(0);
    expect(s.unaccountedMinutes).toBe(0);
  });

  it("handles an empty day", () => {
    const s = summarizeDay([], T(12));
    expect(s.totalMinutes).toBe(0);
    expect(s.gaps).toHaveLength(0);
    expect(s.largestGap).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("formats h/m combinations", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(135)).toBe("2h 15m");
  });
});
