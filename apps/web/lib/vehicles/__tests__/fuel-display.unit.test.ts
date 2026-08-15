import { describe, expect, it } from "vitest";
import {
  dollarsFromCents,
  formatFillDate,
  formatGallons,
  vehicleCostLabel,
} from "../fuel-display";

describe("fuel-display", () => {
  it("labels vehicle cost categories in plain English", () => {
    expect(vehicleCostLabel("vehicle_fuel")).toBe("Fuel");
    expect(vehicleCostLabel("vehicle_maintenance")).toBe("Service");
    expect(vehicleCostLabel("mystery_fee")).toBe("mystery fee");
  });

  it("formats money, gallons, and fill dates", () => {
    expect(dollarsFromCents(8570)).toBe("$85.70");
    expect(formatGallons(22.777)).toBe("22.777");
    expect(formatFillDate("2026-08-12T16:00:00.000Z")).toMatch(/Aug/);
  });
});
