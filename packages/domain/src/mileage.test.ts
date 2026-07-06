import { describe, expect, it } from "vitest";
import { isGpsEstimateSource, milesSourceLabel } from "./mileage";

describe("mileage capture helpers", () => {
  it("detects GPS estimate sources", () => {
    expect(isGpsEstimateSource("gps_estimate")).toBe(true);
    expect(isGpsEstimateSource("bt_gps_estimate")).toBe(true);
    expect(isGpsEstimateSource("odometer")).toBe(false);
    expect(isGpsEstimateSource(null)).toBe(false);
  });

  it("labels capture methods for UI", () => {
    expect(milesSourceLabel("bt_gps_estimate")).toBe("Bluetooth GPS");
    expect(milesSourceLabel(null)).toBeNull();
  });
});