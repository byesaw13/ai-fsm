import { describe, it, expect } from "vitest";
import { hoursSourceLabel, kindLabel, quantityLabel, tmRangeLabel } from "../prepared-scope-display";

describe("prepared scope display", () => {
  it("labels measured, assumed, counted and unknown quantities", () => {
    expect(quantityLabel({ key: "ceiling_sqft", value: 96, unit: "sqft", basis: "measured" })).toBe("96 sq ft ceiling · measured");
    expect(quantityLabel({ key: "baseboard_lf", value: 35.333, unit: "lf", basis: "assumed" })).toBe("35.3 LF baseboard · assumed");
    expect(quantityLabel({ key: "count", value: 3, unit: "each", basis: "measured" })).toBe("3 · measured");
    expect(quantityLabel({ key: "count", value: 2, unit: "lf", basis: "measured" })).toBe("2 LF · measured");
    expect(quantityLabel({ key: "net_wall_sqft", value: null, unit: "sqft", basis: "unknown" })).toBe("walls unknown · needs a height");
    expect(quantityLabel({ key: "net_wall_sqft", value: 243, unit: "sqft", basis: "override" })).toBe("243 sq ft walls · your override");
  });

  it("names hour sources and task kinds in plain words", () => {
    expect(hoursSourceLabel("ai_allowance")).toBe("AI allowance");
    expect(hoursSourceLabel(null)).toBe("no hours yet");
    expect(kindLabel("suggested")).toBe("AI suggestion");
  });

  it("states the reference T&M range", () => {
    const summary = { groups: [], hours_low: 32, hours_high: 51, materials_cents: 130_500, tasks_without_hours: 0, tasks_without_materials_price: 0, unconfirmed_suggestions: 0 };
    expect(tmRangeLabel(summary, 8500)).toBe("$4,025–$5,640");
  });
});
