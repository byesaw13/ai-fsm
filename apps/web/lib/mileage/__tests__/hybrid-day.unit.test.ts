import { describe, it, expect } from "vitest";
import { buildHybridMileageDaySummary, hybridMileageExportToCsv, buildHybridMileageExportRow } from "@ai-fsm/domain";

/** Wiring smoke: web package can consume domain hybrid helpers (TASK-091). */
describe("hybrid mileage web wiring", () => {
  it("builds day summary for strip", () => {
    const s = buildHybridMileageDaySummary({
      vehicleSessionId: "vs1",
      vehicleName: "RAM",
      startOdometer: 100,
      endOdometer: 140,
      primaryMiles: 40,
      primarySource: "odometer",
      gpsMiles: 38,
    });
    expect(s.primaryMiles).toBe(40);
    expect(s.reason).toBe("ok");
  });

  it("csv export is non-empty for accountant hand-off", () => {
    const csv = hybridMileageExportToCsv([
      buildHybridMileageExportRow({
        date: "2026-08-06",
        vehicleSessionId: "vs1",
        vehicleName: "RAM",
        startOdometer: 1,
        endOdometer: 2,
        primaryMiles: 1,
        primarySource: "odometer",
        gpsMiles: 0.9,
      }),
    ]);
    expect(csv.split("\n").length).toBeGreaterThanOrEqual(2);
  });
});
