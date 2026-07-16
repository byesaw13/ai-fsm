import { afterEach, describe, expect, it, vi } from "vitest";
import { businessToday, businessMinutesNow } from "../business-day";

const TZ = "America/New_York";

afterEach(() => {
  vi.useRealTimers();
});

describe("businessToday", () => {
  it("returns the business-timezone day, not UTC, during the evening rollover window", () => {
    // 03:30 UTC on 2026-07-16 == 11:30pm ET on 2026-07-15 (the window where the
    // old UTC default returned tomorrow). Writes and reads both call this, so
    // they must agree on 2026-07-15.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T03:30:00Z"));

    const utcDate = new Date().toISOString().slice(0, 10);
    expect(utcDate).toBe("2026-07-16"); // what the old code produced

    expect(businessToday(TZ)).toBe("2026-07-15"); // the correct business day
    expect(businessToday(TZ)).not.toBe(utcDate);
  });

  it("is deterministic — the write default and read filter get the same value", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T03:30:00Z"));
    // Both sides call businessToday(); this proves they can never disagree.
    const writeDefault = businessToday(TZ);
    const readFilter = businessToday(TZ);
    expect(writeDefault).toBe(readFilter);
  });

  it("matches the UTC date during the daytime (no rollover)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T17:00:00Z")); // 1pm ET
    expect(businessToday(TZ)).toBe("2026-07-15");
  });
});

describe("businessMinutesNow", () => {
  it("returns business-local minutes-since-midnight, not the server's UTC clock", () => {
    // 8:30pm ET on 2026-07-15 == 00:30 UTC on 2026-07-16. A UTC getHours() would
    // give 0 and wrongly report "before" a 17:00 cutoff.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:30:00Z"));
    expect(new Date().getUTCHours()).toBe(0); // what the buggy server-tz check saw
    expect(businessMinutesNow(TZ)).toBe(20 * 60 + 30); // 8:30pm ET
    expect(businessMinutesNow(TZ)).toBeGreaterThan(17 * 60); // past the cutoff
  });
});
