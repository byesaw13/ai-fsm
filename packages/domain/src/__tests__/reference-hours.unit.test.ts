import { describe, it, expect } from "vitest";
import {
  parseReferenceHours,
  referenceHoursEntrySchema,
  referenceSwapHours,
  type ReferenceHoursEntry,
} from "../reference-hours";

// Made-up figures; no licensed Craftsman values in tests.
const base: ReferenceHoursEntry = {
  source: "craftsman",
  book: "Test Book",
  line: "Widget, replace",
  unit: "Ea",
  install_hours: 0.5,
  captured_on: "2026-10-27",
};

describe("referenceHoursEntrySchema", () => {
  it("accepts a minimal entry", () => {
    expect(referenceHoursEntrySchema.safeParse(base).success).toBe(true);
  });

  it.each(["book", "line", "unit", "install_hours"] as const)("rejects a missing %s", (key) => {
    const entry: Record<string, unknown> = { ...base };
    delete entry[key];
    expect(referenceHoursEntrySchema.safeParse(entry).success).toBe(false);
  });

  it("rejects negative hours", () => {
    expect(referenceHoursEntrySchema.safeParse({ ...base, install_hours: -1 }).success).toBe(false);
    expect(referenceHoursEntrySchema.safeParse({ ...base, remove_hours: -0.1 }).success).toBe(false);
  });

  it("rejects an unknown unit", () => {
    expect(referenceHoursEntrySchema.safeParse({ ...base, unit: "gallon" }).success).toBe(false);
  });
});

describe("parseReferenceHours", () => {
  it("keeps valid entries and drops malformed ones", () => {
    expect(parseReferenceHours([base, { nope: true }])).toEqual([base]);
  });

  it("returns [] for non-arrays", () => {
    expect(parseReferenceHours(null)).toEqual([]);
    expect(parseReferenceHours({})).toEqual([]);
  });
});

describe("referenceSwapHours", () => {
  it("install only", () => {
    expect(referenceSwapHours(base)).toEqual({ install: 0.5, remove: 0, swap: 0.5, total: 0.5, minimumApplied: false });
  });

  it("install + remove", () => {
    const r = referenceSwapHours({ ...base, remove_hours: 0.25 });
    expect(r.swap).toBeCloseTo(0.75);
    expect(r.total).toBeCloseTo(0.75);
  });

  it("scales with quantity for per-unit lines", () => {
    const r = referenceSwapHours({ ...base, unit: "LF", install_hours: 0.04, remove_hours: 0.02 }, 30);
    expect(r.install).toBeCloseTo(1.2);
    expect(r.remove).toBeCloseTo(0.6);
    expect(r.swap).toBeCloseTo(1.8);
  });

  it("applies the minimum when the total is below it", () => {
    const r = referenceSwapHours({ ...base, minimum_hours: 2 });
    expect(r.total).toBe(2);
    expect(r.minimumApplied).toBe(true);
  });

  it("does not apply the minimum when above it or for zero quantity", () => {
    expect(referenceSwapHours({ ...base, minimum_hours: 0.25 }).minimumApplied).toBe(false);
    expect(referenceSwapHours({ ...base, minimum_hours: 2 }, 0).total).toBe(0);
  });
});
