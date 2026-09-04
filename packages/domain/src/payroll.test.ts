import { describe, it, expect } from "vitest";
import {
  PAY_TYPES,
  PAY_TYPE_LABELS,
  isClockOpen,
  clockDurationMinutes,
  validateClockCorrection,
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

describe("validateClockCorrection", () => {
  const now = new Date("2026-06-25T18:00:00Z");

  it("requires a reason", () => {
    const r = validateClockCorrection({ clockInAt: "2026-06-25T08:00:00Z", reason: "  " }, now);
    expect(r.ok).toBe(false);
  });

  it("rejects clock-out on or before clock-in", () => {
    const r = validateClockCorrection(
      { clockInAt: "2026-06-25T16:00:00Z", clockOutAt: "2026-06-25T08:00:00Z", reason: "fix" },
      now,
    );
    expect(r).toEqual({ ok: false, error: "Clock-out must be after clock-in." });
  });

  it("rejects future times", () => {
    expect(validateClockCorrection({ clockInAt: "2026-06-25T20:00:00Z", reason: "fix" }, now).ok).toBe(false);
    expect(
      validateClockCorrection(
        { clockInAt: "2026-06-25T08:00:00Z", clockOutAt: "2026-06-25T23:00:00Z", reason: "fix" },
        now,
      ).ok,
    ).toBe(false);
  });

  it("rejects an invalid clock-in", () => {
    expect(validateClockCorrection({ clockInAt: "not-a-date", reason: "fix" }, now).ok).toBe(false);
  });

  it("accepts a valid correction and normalizes to ISO", () => {
    const r = validateClockCorrection(
      { clockInAt: "2026-06-25T08:00:00Z", clockOutAt: "2026-06-25T16:30:00Z", reason: "forgot to clock out" },
      now,
    );
    expect(r).toEqual({
      ok: true,
      clockInAt: "2026-06-25T08:00:00.000Z",
      clockOutAt: "2026-06-25T16:30:00.000Z",
    });
  });

  it("accepts an open (no clock-out) correction", () => {
    const r = validateClockCorrection({ clockInAt: "2026-06-25T08:00:00Z", reason: "wrong start" }, now);
    expect(r).toEqual({ ok: true, clockInAt: "2026-06-25T08:00:00.000Z", clockOutAt: null });
  });
});
