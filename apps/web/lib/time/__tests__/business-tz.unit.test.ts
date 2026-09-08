import { describe, expect, it } from "vitest";
import {
  BUSINESS_TIMEZONE,
  formatBusinessDateTime,
  formatBusinessTime,
  formatBusinessYmd,
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
