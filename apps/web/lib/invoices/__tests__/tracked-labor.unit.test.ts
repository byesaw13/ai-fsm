import { describe, expect, it } from "vitest";
import {
  actualLaborCostCents,
  laborCostForMargin,
  roundedQuarterHoursFromMinutes,
  trackedHoursFromMinutes,
  trackedLaborCents,
} from "../tracked-labor";

describe("trackedHoursFromMinutes", () => {
  it("converts to hours with 2 decimal places", () => {
    expect(trackedHoursFromMinutes(0)).toBe(0);
    expect(trackedHoursFromMinutes(90)).toBe(1.5);
    expect(trackedHoursFromMinutes(1354)).toBe(22.57);
  });
});

describe("actualLaborCostCents", () => {
  it("uses actual hours × burdened cost rate (default $50/hr)", () => {
    // 2 hours @ $50 = $100
    expect(actualLaborCostCents(120)).toBe(100_00);
    // 22.57 hrs ≈ 1354 min @ $50
    expect(actualLaborCostCents(1354)).toBe(Math.round((1354 / 60) * 5000));
  });

  it("returns 0 for empty time", () => {
    expect(actualLaborCostCents(0)).toBe(0);
  });
});

describe("laborCostForMargin", () => {
  it("prefers tracked cost when any minutes are logged", () => {
    const r = laborCostForMargin({
      trackedMinutes: 120,
      estimatedLaborCostCents: 999_00,
    });
    expect(r.source).toBe("tracked");
    expect(r.laborCostCents).toBe(100_00);
    expect(r.trackedHours).toBe(2);
    expect(r.actualLaborCostCents).toBe(100_00);
  });

  it("falls back to estimate when no time logged", () => {
    const r = laborCostForMargin({
      trackedMinutes: 0,
      estimatedLaborCostCents: 400_00,
    });
    expect(r.source).toBe("estimate");
    expect(r.laborCostCents).toBe(400_00);
    expect(r.actualLaborCostCents).toBeNull();
  });

  it("returns none when neither tracked nor estimate", () => {
    const r = laborCostForMargin({
      trackedMinutes: 0,
      estimatedLaborCostCents: null,
    });
    expect(r.source).toBe("none");
    expect(r.laborCostCents).toBeNull();
  });
});

describe("billing vs cost transforms", () => {
  it("bills at quarter-hour customer rate; costs at actual burden rate", () => {
    // 68 min → 1.25 billable hrs @ $115 = $143.75
    expect(roundedQuarterHoursFromMinutes(68)).toBe(1.25);
    expect(trackedLaborCents(68)).toBe(1.25 * 115_00);
    // cost uses actual 68/60 * $50
    expect(actualLaborCostCents(68)).toBe(Math.round((68 / 60) * 5000));
  });
});
