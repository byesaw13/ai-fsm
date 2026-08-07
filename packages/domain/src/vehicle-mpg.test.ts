import { describe, it, expect } from "vitest";
import { computeMpgSegments, latestMpg } from "./vehicle-mpg";

describe("vehicle-mpg (TASK-093)", () => {
  it("computes full-tank delta with partials accumulated", () => {
    const segs = computeMpgSegments([
      { filledAt: "2026-01-01T10:00:00Z", odometer: 10000, gallons: 15, isFullTank: true, odometerSuspect: false },
      { filledAt: "2026-01-10T10:00:00Z", odometer: 10200, gallons: 5, isFullTank: false, odometerSuspect: false },
      { filledAt: "2026-01-20T10:00:00Z", odometer: 10400, gallons: 10, isFullTank: true, odometerSuspect: false },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].miles).toBe(400);
    expect(segs[0].gallons).toBe(15); // 5 partial + 10 full
    expect(segs[0].mpg).toBeCloseTo(400 / 15, 1);
  });

  it("excludes suspect odometer rows", () => {
    const segs = computeMpgSegments([
      { filledAt: "2026-01-01T10:00:00Z", odometer: 10000, gallons: 15, isFullTank: true, odometerSuspect: false },
      { filledAt: "2026-01-15T10:00:00Z", odometer: 9000, gallons: 12, isFullTank: true, odometerSuspect: true },
      { filledAt: "2026-01-20T10:00:00Z", odometer: 10300, gallons: 10, isFullTank: true, odometerSuspect: false },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0].miles).toBe(300);
  });

  it("returns null latest when no full-tank pair", () => {
    expect(
      latestMpg([
        { filledAt: "2026-01-01T10:00:00Z", odometer: 10000, gallons: 15, isFullTank: true, odometerSuspect: false },
      ]),
    ).toBeNull();
  });
});
