import { describe, expect, it } from "vitest";
import { productionRateHours } from "../production-rates";

const dayRate = {
  base_rate: 400,
  rate_unit: "sqft_per_day" as const,
  calibrated: false,
};

describe("productionRateHours", () => {
  it("turns 400 sq ft/day at 8 hours into 50 sq ft/hour", () => {
    const result = productionRateHours(400, dayRate, [], 8);
    expect(result.hours).toBe(8);
    expect(400 / result.hours).toBe(50);
    expect(result.calibrated).toBe(false);
  });

  it("uses the hours-per-day setting for a per-day rate", () => {
    expect(productionRateHours(400, dayRate, [], 10).hours).toBe(10);
  });

  it("ignores hours-per-day for a per-hour rate", () => {
    const result = productionRateHours(100, {
      base_rate: 50,
      rate_unit: "sqft_per_hour",
      calibrated: true,
    }, [], 8);
    expect(result.hours).toBe(2);
    expect(result.calibrated).toBe(true);
  });

  it("treats a negative modifier as slower throughput", () => {
    const plain = productionRateHours(400, dayRate, [], 8).hours;
    const slower = productionRateHours(400, dayRate, [{ modifier_pct: -0.15, calibrated: false }], 8).hours;
    expect(slower).toBeCloseTo(plain / 0.85, 5);
  });

  it("is calibrated only when the rate and every modifier are calibrated", () => {
    const rate = { ...dayRate, calibrated: true };
    expect(productionRateHours(400, rate, [], 8).calibrated).toBe(true);
    expect(productionRateHours(400, rate, [{ modifier_pct: -0.15, calibrated: false }], 8).calibrated).toBe(false);
    expect(productionRateHours(400, rate, [{ modifier_pct: -0.15, calibrated: true }], 8).calibrated).toBe(true);
    expect(productionRateHours(400, dayRate, [{ modifier_pct: -0.15, calibrated: true }], 8).calibrated).toBe(false);
  });
});
