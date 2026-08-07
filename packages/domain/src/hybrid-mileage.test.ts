import { describe, it, expect } from "vitest";
import {
  buildHybridMileageDaySummary,
  buildHybridMileageExportRow,
  hybridMileageExportToCsv,
  hybridVerifyLabel,
} from "./hybrid-mileage";

describe("hybrid-mileage (TASK-091)", () => {
  it("marks odometer primary and ok when GPS agrees", () => {
    const s = buildHybridMileageDaySummary({
      vehicleSessionId: "vs1",
      vehicleName: "RAM",
      startOdometer: 1000,
      endOdometer: 1050,
      primaryMiles: 50,
      primarySource: "odometer",
      gpsMiles: 48,
    });
    expect(s.primaryMiles).toBe(50);
    expect(s.flagged).toBe(false);
    expect(s.reason).toBe("ok");
    expect(hybridVerifyLabel(s.reason, s.deltaPercent)).toMatch(/corroborates/i);
  });

  it("flags divergence >20%", () => {
    const s = buildHybridMileageDaySummary({
      vehicleSessionId: "vs1",
      vehicleName: "RAM",
      startOdometer: 1000,
      endOdometer: 1100,
      primaryMiles: 100,
      primarySource: "odometer",
      gpsMiles: 40,
    });
    // 40 is under 50% coverage → no_gps_coverage, not diverged
    expect(s.reason).toBe("no_gps_coverage");
  });

  it("flags real divergence when GPS covered the trip", () => {
    const s = buildHybridMileageDaySummary({
      vehicleSessionId: "vs1",
      vehicleName: "RAM",
      startOdometer: 1000,
      endOdometer: 1100,
      primaryMiles: 100,
      primarySource: "odometer",
      gpsMiles: 130,
    });
    expect(s.flagged).toBe(true);
    expect(s.reason).toBe("diverged");
  });

  it("builds accountant CSV with primary method and verify", () => {
    const row = buildHybridMileageExportRow({
      date: "2026-08-06",
      vehicleSessionId: "vs-abc",
      vehicleName: "RAM",
      startOdometer: 48120,
      endOdometer: 48168,
      primaryMiles: 48,
      primarySource: "odometer",
      gpsMiles: 44.2,
    });
    const csv = hybridMileageExportToCsv([row]);
    expect(csv).toContain("primary_miles");
    expect(csv).toContain("Odometer");
    expect(csv).toContain("2026-08-06");
    expect(csv).toContain("48");
    expect(csv).toContain("vs-abc");
  });
});
