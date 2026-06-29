import { describe, it, expect } from "vitest";
import { buildMetadataSections } from "../MaterialsMetadata";

// buildMetadataSections drives what MaterialsMetadata renders: which groups
// appear, in what order, and that empty groups are dropped.

describe("buildMetadataSections", () => {
  it("renders all three groups when each has items", () => {
    const sections = buildMetadataSections({
      assumptions: ["Assumed 3 can lights"],
      missing_measurements: ["Living room ceiling height"],
      excluded_customer_supplied_items: ["Paint (customer-supplied)"],
    });
    const keys = sections.map((s) => s.key);
    expect(keys).toContain("assumptions");
    expect(keys).toContain("missing_measurements");
    expect(keys).toContain("excluded_customer_supplied_items");
    expect(sections).toHaveLength(3);
  });

  it("orders missing measurements first (it's the warning the owner must act on)", () => {
    const sections = buildMetadataSections({
      assumptions: ["a"],
      missing_measurements: ["m"],
      excluded_customer_supplied_items: ["e"],
    });
    expect(sections[0].key).toBe("missing_measurements");
    expect(sections[0].tone).toBe("warning");
  });

  it("hides empty groups and keeps the populated ones", () => {
    const sections = buildMetadataSections({
      assumptions: ["Assumed standard 8ft ceilings"],
      missing_measurements: [],
      excluded_customer_supplied_items: undefined,
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("assumptions");
  });

  it("drops blank/whitespace-only entries and trims survivors", () => {
    const sections = buildMetadataSections({
      missing_measurements: ["  ", "", "  Deck linear feet "],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].items).toEqual(["Deck linear feet"]);
  });

  it("renders nothing when there is no metadata", () => {
    expect(buildMetadataSections(null)).toEqual([]);
    expect(buildMetadataSections(undefined)).toEqual([]);
    expect(buildMetadataSections({})).toEqual([]);
    expect(
      buildMetadataSections({ assumptions: [], missing_measurements: [], excluded_customer_supplied_items: [] })
    ).toEqual([]);
  });
});
