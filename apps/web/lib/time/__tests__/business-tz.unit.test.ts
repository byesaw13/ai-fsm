import { describe, expect, it } from "vitest";
import {
  BUSINESS_TIMEZONE,
  easternDatetimeLocalToUtc,
  easternWallToUtc,
  formatBusinessDateTime,
  formatBusinessTime,
  formatBusinessYmd,
  utcToEasternClock,
  utcToEasternDatetimeLocal,
} from "../business-tz";

describe("business timezone display", () => {
  // 15:00 UTC on a winter date = 10:00 AM Eastern
  const utcAfternoon = "2026-02-23T15:00:00.000Z";

  it("is America/New_York", () => {
    expect(BUSINESS_TIMEZONE).toBe("America/New_York");
  });

  it("formats clock time in Eastern, not container UTC", () => {
    const out = formatBusinessTime(utcAfternoon);
    expect(out).toMatch(/10:00/);
    expect(out).toMatch(/AM/i);
    expect(out).not.toMatch(/3:00/);
  });

  it("formats date+time in Eastern", () => {
    const out = formatBusinessDateTime(utcAfternoon);
    expect(out).toMatch(/Feb/);
    expect(out).toMatch(/23/);
    expect(out).toMatch(/10:00/);
  });

  it("keeps an evening Eastern instant on the Eastern calendar day", () => {
    // 10:00 PM ET Feb 23 = 03:00 UTC Feb 24
    expect(formatBusinessYmd("2026-02-24T03:00:00.000Z")).toBe("2026-02-23");
  });
});

describe("eastern wall-clock parse", () => {
  it("maps 10:00 AM EST to 15:00 UTC", () => {
    expect(easternWallToUtc("2026-02-23", "10:00").toISOString()).toBe(
      "2026-02-23T15:00:00.000Z",
    );
  });

  it("maps 10:00 AM EDT to 14:00 UTC", () => {
    expect(easternWallToUtc("2026-07-01", "10:00").toISOString()).toBe(
      "2026-07-01T14:00:00.000Z",
    );
  });

  it("round-trips clock values", () => {
    const instant = easternWallToUtc("2026-02-23", "09:30");
    expect(utcToEasternClock(instant)).toBe("09:30");
    expect(utcToEasternDatetimeLocal(instant)).toBe("2026-02-23T09:30");
    expect(easternDatetimeLocalToUtc("2026-02-23T09:30").toISOString()).toBe(
      instant.toISOString(),
    );
  });

  it("adds duration in Eastern, not the runtime zone", () => {
    const start = easternWallToUtc("2026-07-01", "09:00");
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    expect(formatBusinessTime(end)).toMatch(/10:00/);
  });
});
