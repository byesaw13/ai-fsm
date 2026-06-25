import { describe, it, expect } from "vitest";
import {
  PAY_TYPES,
  PAY_TYPE_LABELS,
  isClockOpen,
  clockDurationMinutes,
} from "./payroll";

describe("payroll clock", () => {
  it("labels every pay type", () => {
    for (const t of PAY_TYPES) {
      expect(PAY_TYPE_LABELS[t]).toBeTruthy();
    }
  });

  it("knows an open clock", () => {
    expect(isClockOpen("open")).toBe(true);
    expect(isClockOpen("closed")).toBe(false);
  });

  it("measures a closed session between in and out", () => {
    expect(
      clockDurationMinutes("2026-06-25T08:00:00Z", "2026-06-25T16:30:00Z"),
    ).toBe(510); // 8.5h
  });

  it("measures an open session to `now`", () => {
    const now = new Date("2026-06-25T10:00:00Z");
    expect(clockDurationMinutes("2026-06-25T08:00:00Z", null, now)).toBe(120);
  });

  it("never returns negative time", () => {
    expect(
      clockDurationMinutes("2026-06-25T16:00:00Z", "2026-06-25T08:00:00Z"),
    ).toBe(0);
  });
});
