import { describe, it, expect } from "vitest";
import { reviewEstimate } from "../review";

describe("estimate review engine", () => {
  it("returns no warnings for a well-formed painting estimate", async () => {
    const result = await reviewEstimate({
      sq_ft: 1200,
      prep_level: 5,
      includes_trim: true,
      includes_ceiling: false,
      subtotal_cents: 295200,
      total_cents: 295200,
      internal_labor_cost_cents: 127500,
      internal_material_cost_cents: 35000,
      line_item_count: 3,
    });

    expect(result.suggestions.filter((s) => s.type === "warning")).toHaveLength(0);
    expect(result.score).toBeGreaterThan(80);
  });

  it("warns when trim is not included", async () => {
    const result = await reviewEstimate({
      sq_ft: 1000,
      prep_level: 5,
      includes_trim: false,
      includes_ceiling: false,
      subtotal_cents: 205000,
      total_cents: 205000,
      internal_labor_cost_cents: 85000,
      internal_material_cost_cents: null,
      line_item_count: 1,
    });

    const trimWarning = result.suggestions.find(
      (s) => s.field === "includes_trim" && s.type === "warning"
    );
    expect(trimWarning).toBeDefined();
    expect(trimWarning?.message).toContain("Trim is not included");
  });

  it("warns when prep level is too low for large area", async () => {
    const result = await reviewEstimate({
      sq_ft: 1500,
      prep_level: 2,
      includes_trim: true,
      includes_ceiling: false,
      subtotal_cents: 307500,
      total_cents: 307500,
      internal_labor_cost_cents: 127500,
      internal_material_cost_cents: null,
      line_item_count: 1,
    });

    const prepWarning = result.suggestions.find(
      (s) => s.field === "prep_level" && s.type === "warning"
    );
    expect(prepWarning).toBeDefined();
    expect(prepWarning?.message).toContain("too low");
  });

  it("suggests ceiling for large rooms", async () => {
    const result = await reviewEstimate({
      sq_ft: 800,
      prep_level: 5,
      includes_trim: true,
      includes_ceiling: false,
      subtotal_cents: 164000,
      total_cents: 164000,
      internal_labor_cost_cents: 68000,
      internal_material_cost_cents: null,
      line_item_count: 1,
    });

    const ceilingTip = result.suggestions.find(
      (s) => s.field === "includes_ceiling" && s.type === "tip"
    );
    expect(ceilingTip).toBeDefined();
  });

  it("warns when margin is critically low", async () => {
    const result = await reviewEstimate({
      sq_ft: 500,
      prep_level: 5,
      includes_trim: true,
      includes_ceiling: false,
      subtotal_cents: 102500,
      total_cents: 102500,
      internal_labor_cost_cents: 100000,
      internal_material_cost_cents: null,
      line_item_count: 1,
    });

    const marginWarning = result.suggestions.find(
      (s) => s.field === "margin" && s.type === "warning"
    );
    expect(marginWarning).toBeDefined();
    expect(marginWarning?.message).toContain("critically low");
  });

  it("scores lower with more warnings", async () => {
    const [badEstimate, goodEstimate] = await Promise.all([
      reviewEstimate({
        sq_ft: 1500,
        prep_level: 2,
        includes_trim: false,
        includes_ceiling: false,
        subtotal_cents: 100000,
        total_cents: 100000,
        internal_labor_cost_cents: 95000,
        internal_material_cost_cents: null,
        line_item_count: 0,
      }),
      reviewEstimate({
        sq_ft: 1200,
        prep_level: 5,
        includes_trim: true,
        includes_ceiling: false,
        subtotal_cents: 295200,
        total_cents: 295200,
        internal_labor_cost_cents: 127500,
        internal_material_cost_cents: 35000,
        line_item_count: 3,
      }),
    ]);

    expect(badEstimate.score).toBeLessThan(goodEstimate.score);
  });

  it("handles generic (non-painting) estimates", async () => {
    const result = await reviewEstimate({
      sq_ft: null,
      prep_level: null,
      includes_trim: false,
      includes_ceiling: false,
      subtotal_cents: 50000,
      total_cents: 50000,
      internal_labor_cost_cents: 20000,
      internal_material_cost_cents: null,
      line_item_count: 2,
    });

    expect(result.summary).toContain("Generic estimate");
  });

  it("warns on flat-rate generic with no line items", async () => {
    const result = await reviewEstimate({
      sq_ft: null,
      prep_level: null,
      includes_trim: false,
      includes_ceiling: false,
      subtotal_cents: 50000,
      total_cents: 50000,
      internal_labor_cost_cents: null,
      internal_material_cost_cents: null,
      line_item_count: 0,
    });

    const info = result.suggestions.find((s) => s.field === "line_items");
    expect(info).toBeDefined();
  });

  it("warns when estimate is priced below the expected rate range", async () => {
    const result = await reviewEstimate({
      sq_ft: 1000,
      prep_level: 5,
      includes_trim: false,
      includes_ceiling: false,
      subtotal_cents: 80000, // $0.80/sqft — well below $2.05 standard
      total_cents: 80000,
      internal_labor_cost_cents: null,
      internal_material_cost_cents: null,
      line_item_count: 1,
    });

    const pricingWarning = result.suggestions.find(
      (s) => s.field === "pricing" && s.type === "warning"
    );
    expect(pricingWarning).toBeDefined();
    expect(pricingWarning?.message).toContain("below minimum");
  });

  it("warns when prep level is high for small area", async () => {
    const result = await reviewEstimate({
      sq_ft: 200,
      prep_level: 9,
      includes_trim: true,
      includes_ceiling: false,
      subtotal_cents: 48000,
      total_cents: 48000,
      internal_labor_cost_cents: 17000,
      internal_material_cost_cents: null,
      line_item_count: 1,
    });

    const prepInfo = result.suggestions.find(
      (s) => s.field === "prep_level" && s.type === "info"
    );
    expect(prepInfo).toBeDefined();
    expect(prepInfo?.message).toContain("high for a small area");
  });
});
