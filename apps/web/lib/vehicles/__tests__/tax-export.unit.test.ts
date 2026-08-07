import { describe, it, expect } from "vitest";
import { formatVehicleTaxCsv } from "../tax-export";
import { aggregateVehicleCost } from "../cost-summary";

describe("formatVehicleTaxCsv", () => {
  it("emits header and vehicle-grouped rows", () => {
    const csv = formatVehicleTaxCsv([
      {
        vehicle_nickname: "Ram",
        expense_date: "2026-01-15",
        vendor_name: "Shell",
        category: "vehicle_fuel",
        amount_cents: 4500,
        notes: "fill",
      },
    ]);
    expect(csv).toContain("Vehicle,Date,Vendor,Category,Amount,Notes");
    expect(csv).toContain("Ram");
    expect(csv).toContain("vehicle_fuel");
    expect(csv).toContain("$45.00");
  });
});

describe("aggregateVehicleCost", () => {
  it("sums categories and cost per mile", () => {
    const agg = aggregateVehicleCost(
      [
        { category: "vehicle_fuel", total_cents: 10000, expense_count: 2 },
        { category: "vehicle_maintenance", total_cents: 5000, expense_count: 1 },
      ],
      100,
    );
    expect(agg.totalCents).toBe(15000);
    expect(agg.costPerMileCents).toBe(150);
    expect(agg.byCategory.vehicle_fuel).toBe(10000);
  });

  it("returns null cost per mile without miles", () => {
    const agg = aggregateVehicleCost(
      [{ category: "vehicle_fuel", total_cents: 1000, expense_count: 1 }],
      null,
    );
    expect(agg.costPerMileCents).toBeNull();
  });
});
