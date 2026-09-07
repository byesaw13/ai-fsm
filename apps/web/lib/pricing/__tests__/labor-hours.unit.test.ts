import { describe, it, expect } from "vitest";
import { laborCostCentsFromHours, laborHoursFromCostCents } from "../labor-hours";

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

describe("laborCostCentsFromHours", () => {
  it("stores hours × cost rate (labor only, not materials)", () => {
    expect(laborCostCentsFromHours(8, 50_00)).toBe(400_00);
  });

  it("round-trips with laborHoursFromCostCents", () => {
    const cost = laborCostCentsFromHours(8, 50_00);
    expect(laborHoursFromCostCents(cost, 50_00)).toBe(8);
  });

  it("does not use a materials-inclusive engine total as labor cost", () => {
    // $400 labor + $500 materials. Inverting the sum at $50/hr would seed 18h.
    const laborOnly = laborCostCentsFromHours(8, 50_00);
    const withMaterials = laborOnly! + 500_00;
    expect(laborHoursFromCostCents(withMaterials, 50_00)).toBe(18);
    expect(laborHoursFromCostCents(laborOnly, 50_00)).toBe(8);
  });
});

