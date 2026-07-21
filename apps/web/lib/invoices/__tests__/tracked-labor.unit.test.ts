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
