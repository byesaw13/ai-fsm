import { describe, expect, it } from "vitest";
import {
  actualLaborCostCents,
  formatMinutesAsHoursMinutes,
  laborCostForMargin,
  mapTrackedLaborDayRows,
  roundedQuarterHoursFromMinutes,
  TRACKED_LABOR_JOB_WORK_WHERE,
  trackedHoursFromMinutes,
  trackedLaborCents,
  serviceMinimumAdjustmentCents,
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

describe("TRACKED_LABOR_JOB_WORK_WHERE", () => {
  it("includes job, visit, and work_order entity links", () => {
    expect(TRACKED_LABOR_JOB_WORK_WHERE).toContain("entity_type = 'job'");
    expect(TRACKED_LABOR_JOB_WORK_WHERE).toContain("entity_type = 'visit'");
    expect(TRACKED_LABOR_JOB_WORK_WHERE).toContain("entity_type = 'work_order'");
    expect(TRACKED_LABOR_JOB_WORK_WHERE).toContain("work_orders wo");
  });

  it("counts only billable labor and excludes site_visit assessments", () => {
    expect(TRACKED_LABOR_JOB_WORK_WHERE).toContain("labor_bucket = 'billable'");
    expect(TRACKED_LABOR_JOB_WORK_WHERE).toContain("site_visit");
  });
});

describe("formatMinutesAsHoursMinutes", () => {
  it("formats whole hours, minutes only, and mixed", () => {
    expect(formatMinutesAsHoursMinutes(0)).toBe("0m");
    expect(formatMinutesAsHoursMinutes(45)).toBe("45m");
    expect(formatMinutesAsHoursMinutes(120)).toBe("2h");
    expect(formatMinutesAsHoursMinutes(364)).toBe("6h 4m");
  });
});

describe("mapTrackedLaborDayRows", () => {
  it("maps SQL rows into display hours per day", () => {
    const days = mapTrackedLaborDayRows([
      {
        work_date: "2026-07-17",
        started_at: "2026-07-17T12:10:01.000Z",
        ended_at: "2026-07-17T18:14:01.000Z",
        minutes: "364",
        entry_count: 1,
      },
      {
        work_date: "2026-07-18",
        started_at: "2026-07-18T12:07:43.000Z",
        ended_at: "2026-07-18T22:31:09.000Z",
        minutes: 623.43,
        entry_count: "1",
      },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0].work_date).toBe("2026-07-17");
    expect(days[0].hours).toBe(6.07);
    expect(days[0].minutes).toBe(364);
    expect(days[1].hours).toBe(10.39);
    expect(days[1].entry_count).toBe(1);
  });
});

describe("serviceMinimumAdjustmentCents", () => {
  const MIN = 185_00; // existing minimum_service_fee_cents

  it("tops up a below-minimum invoice total to the minimum", () => {
    // $57.50 labor only → needs $127.50 to reach $185
    expect(serviceMinimumAdjustmentCents(57_50, MIN)).toBe(127_50);
  });

  it("applies to the WHOLE subtotal (labor + materials), not labor alone", () => {
    // $57.50 labor + $100 materials = $157.50 → tops up $27.50 to $185
    expect(serviceMinimumAdjustmentCents(157_50, MIN)).toBe(27_50);
  });

  it("is zero when the subtotal already meets or exceeds the minimum", () => {
    expect(serviceMinimumAdjustmentCents(345_00, MIN)).toBe(0);
    expect(serviceMinimumAdjustmentCents(185_00, MIN)).toBe(0); // exact boundary
  });

  it("rounds to whole cents before comparing (no fractional-cent drift)", () => {
    // fractional subtotal (odd rate × quarter hour) rounds before the top-up
    expect(serviceMinimumAdjustmentCents(15750.25, MIN)).toBe(27_50);
  });

  it("bills the full minimum when the subtotal is zero", () => {
    expect(serviceMinimumAdjustmentCents(0, MIN)).toBe(185_00);
  });
});
