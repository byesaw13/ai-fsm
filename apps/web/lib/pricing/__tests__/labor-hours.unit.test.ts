import { describe, it, expect } from "vitest";
import { laborHoursFromCostCents } from "../labor-hours";

describe("laborHoursFromCostCents", () => {
  it("divides cost by the cost rate the engine used (not a hardcoded rate)", () => {
    // Engine: cost = hours × cost rate. 8 hrs × $50 = $400 → recover 8.0 hrs.
    expect(laborHoursFromCostCents(400_00, 50_00)).toBe(8);
  });

  it("rounds to one decimal", () => {
    // $333 / $50 = 6.66 → 6.7
    expect(laborHoursFromCostCents(333_00, 50_00)).toBe(6.7);
  });

  it("the old hardcoded $85 divisor understated hours vs the real $50 cost rate", () => {
    const cost = 400_00;
    const wrong = laborHoursFromCostCents(cost, 85_00); // stale rate
    const right = laborHoursFromCostCents(cost, 50_00); // engine cost rate
    expect(wrong!).toBeLessThan(right!); // 4.7 < 8.0
  });

  it("returns null when cost is missing", () => {
    expect(laborHoursFromCostCents(null, 50_00)).toBeNull();
    expect(laborHoursFromCostCents(undefined, 50_00)).toBeNull();
  });

  it("returns null when the rate is missing or non-positive (no divide-by-zero)", () => {
    expect(laborHoursFromCostCents(400_00, 0)).toBeNull();
    expect(laborHoursFromCostCents(400_00, null)).toBeNull();
  });
});
