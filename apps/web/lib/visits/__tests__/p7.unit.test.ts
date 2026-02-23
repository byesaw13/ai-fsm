import { describe, expect, it } from "vitest";
import {
  formatOverdueLabel,
  formatVisitDateLabel,
  formatVisitDateTime,
  formatVisitTime,
  isSameCalendarDay,
  isVisitOverdue,
} from "../p7";

describe("visits/p7 UI helpers", () => {
  const base = "2026-02-23T15:00:00.000Z";
  const nowMs = new Date("2026-02-23T16:30:00.000Z").getTime();

  it("formats visit time with hour and minute", () => {
    const out = formatVisitTime(base);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/:/);
  });

  it("formats visit date+time", () => {
    const out = formatVisitDateTime(base);
    expect(out).toContain("/");
    expect(out).toMatch(/:/);
  });

  it("formats short visit date label", () => {
    const out = formatVisitDateLabel(base);
    expect(out.length).toBeGreaterThan(4);
  });

  it("detects overdue scheduled visits", () => {
    expect(
      isVisitOverdue({ scheduled_start: base, status: "scheduled" }, nowMs)
    ).toBe(true);
  });

  it("detects overdue arrived visits", () => {
    expect(
      isVisitOverdue({ scheduled_start: base, status: "arrived" }, nowMs)
    ).toBe(true);
  });

  it("does not mark completed visits as overdue", () => {
    expect(
      isVisitOverdue({ scheduled_start: base, status: "completed" }, nowMs)
    ).toBe(false);
  });

  it("does not mark future visits as overdue", () => {
    expect(
      isVisitOverdue(
        { scheduled_start: "2026-02-23T18:00:00.000Z", status: "scheduled" },
        nowMs
      )
    ).toBe(false);
  });

  it("detects same calendar day", () => {
    expect(isSameCalendarDay(base, new Date(base))).toBe(true);
  });

  it("detects different calendar day", () => {
    const nextLocalDay = new Date(base);
    nextLocalDay.setDate(nextLocalDay.getDate() + 1);
    expect(isSameCalendarDay(base, nextLocalDay)).toBe(false);
  });

  it("formats overdue label in hours", () => {
    expect(formatOverdueLabel(base, nowMs)).toBe("2h overdue");
  });

  it("formats overdue label in minutes", () => {
    const ts = "2026-02-23T16:10:00.000Z";
    expect(formatOverdueLabel(ts, nowMs)).toBe("20m overdue");
  });
});
