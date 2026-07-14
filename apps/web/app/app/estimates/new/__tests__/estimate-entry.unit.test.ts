import { describe, it, expect } from "vitest";
import { resolveEntryPricingMode, type EstimateMode } from "../EstimateLaunchModal";

describe("estimate entry simplification", () => {
  it("entry modes are quick/detailed/ai/tm (dead Duplicate/Convert paths removed)", () => {
    const modes: EstimateMode[] = ["quick", "detailed", "ai", "tm"];
    // Type-level guarantee plus an explicit runtime list for regression safety.
    expect(modes).toHaveLength(4);
    expect(modes).not.toContain("duplicate" as unknown as EstimateMode);
    expect(modes).not.toContain("convert" as unknown as EstimateMode);
  });

  it("Quick entry defaults to flat-rate (the common Dovetails estimate)", () => {
    expect(resolveEntryPricingMode("quick")).toBe("flat_rate");
  });

  it("Detailed entry defaults to itemized", () => {
    expect(resolveEntryPricingMode("detailed")).toBe("itemized");
  });

  it("AI entry continues in itemized (AI drafts produce line items)", () => {
    expect(resolveEntryPricingMode("ai")).toBe("itemized");
  });

  it("T&M from notes continues in itemized (hour/range line items)", () => {
    expect(resolveEntryPricingMode("tm")).toBe("itemized");
  });

  it("an explicit pricing override always wins over the entry-mode default", () => {
    expect(resolveEntryPricingMode("quick", "multi_option")).toBe("multi_option");
    expect(resolveEntryPricingMode("detailed", "flat_rate")).toBe("flat_rate");
  });
});
