import { describe, expect, it } from "vitest";
import {
  formatOverdueLabel,
  formatVisitDateLabel,
  formatVisitDateTime,
  formatVisitTime,
  isSameCalendarDay,
  isVisitOverdue,
} from "../formatting";

describe("visits/formatting UI helpers", () => {
  const base = "2026-02-23T15:00:00.000Z";
  const nowMs = new Date("2026-02-23T16:30:00.000Z").getTime();

  it("formats visit time in America/New_York (not container UTC)", () => {
    // 15:00 UTC on a winter date = 10:00 AM Eastern
    const out = formatVisitTime(base);
    expect(out).toMatch(/10:00/);
    expect(out).toMatch(/AM/i);
  });

  it("formats visit date+time in business timezone", () => {
    const out = formatVisitDateTime(base);
    expect(out).toMatch(/Feb/);
    expect(out).toMatch(/23/);
    expect(out).toMatch(/10:00/);
  });

  it("formats short visit date label", () => {
    const out = formatVisitDateLabel(base);
    expect(out).toMatch(/Feb/);
    expect(out).toMatch(/23/);
  });

  it("does not treat same-day late scheduled visits as overdue", () => {
    // Start was 10:00 AM ET; "now" is 11:30 AM ET same day — late, not overdue.
    expect(
      isVisitOverdue({ scheduled_start: base, status: "scheduled" }, nowMs)
    ).toBe(false);
  });

  it("does not treat same-day late arrived visits as overdue", () => {
    expect(
      isVisitOverdue({ scheduled_start: base, status: "arrived" }, nowMs)
    ).toBe(false);
  });

  it("flags scheduled visits from a prior business day as overdue", () => {
    const nextDay = new Date("2026-02-24T16:30:00.000Z").getTime(); // Feb 24 ET afternoon
    expect(
      isVisitOverdue({ scheduled_start: base, status: "scheduled" }, nextDay)
    ).toBe(true);
  });

  it("flags arrived visits from a prior business day as overdue", () => {
    const nextDay = new Date("2026-02-24T16:30:00.000Z").getTime();
    expect(
      isVisitOverdue({ scheduled_start: base, status: "arrived" }, nextDay)
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

  it("gives in-progress visits a grace window past scheduled_end", () => {
    const end = "2026-02-23T20:00:00.000Z"; // 3:00 PM ET
    const justPastEnd = new Date("2026-02-23T20:30:00.000Z").getTime();
    const wellPastEnd = new Date("2026-02-23T23:00:00.000Z").getTime(); // +3h
    expect(
      isVisitOverdue(
        { scheduled_start: base, scheduled_end: end, status: "in_progress" },
        justPastEnd
      )
    ).toBe(false);
    expect(
      isVisitOverdue(
        { scheduled_start: base, scheduled_end: end, status: "in_progress" },
        wellPastEnd
      )
    ).toBe(true);
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
