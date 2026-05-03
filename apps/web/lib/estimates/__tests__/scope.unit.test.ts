import { describe, it, expect } from "vitest";
import { translateScope } from "../scope";

describe("scope translator", () => {
  it("parses direct sq ft measurement", () => {
    const result = translateScope("Need 1200 sq ft painted");
    expect(result.sq_ft).toBe(1200);
    expect(result.suggested_job_type).toBe("painting");
  });

  it("parses room-based sq ft estimation", () => {
    const result = translateScope("Paint 3 bedrooms and 2 bathrooms");
    expect(result.sq_ft).toBe(3 * 150 + 2 * 50); // 550
    expect(result.parsed_items.length).toBeGreaterThanOrEqual(2);
  });

  it("detects ceiling keyword", () => {
    const result = translateScope("Paint 2 bedrooms and the ceiling too");
    expect(result.includes_ceiling).toBe(true);
  });

  it("detects trim keywords", () => {
    const result = translateScope("Paint living room with trim and baseboard");
    expect(result.includes_trim).toBe(true);
    expect(result.parsed_items.some((i) => i.includes("Trim"))).toBe(true);
  });

  it("sets high prep level for repair keywords", () => {
    const result = translateScope("Need to patch holes, sand walls, and repair water damage before painting");
    expect(result.prep_level).toBeGreaterThanOrEqual(6);
  });

  it("sets low prep level for touch-up keywords", () => {
    const result = translateScope("Just a touch up, fresh coat of the same color");
    expect(result.prep_level).toBeLessThanOrEqual(4);
  });

  it("parses labor hours", () => {
    const result = translateScope("Paint 2 bedrooms, about 16 hours of work");
    expect(result.labor_hours_estimate).toBe(16);
  });

  it("parses material cost", () => {
    const result = translateScope("Paint kitchen and trim, materials around $350");
    expect(result.material_cost_cents).toBe(35000);
  });

  it("handles complex notes with multiple fields", () => {
    const result = translateScope(
      "Paint 3 bedrooms and 1 bathroom. Need to patch some holes and sand walls. " +
      "Include ceiling and trim. Budget about $400 for materials. Should take 24 hours."
    );

    expect(result.sq_ft).toBe(3 * 150 + 1 * 50); // 500
    expect(result.prep_level).toBeGreaterThanOrEqual(5);
    expect(result.includes_ceiling).toBe(true);
    expect(result.includes_trim).toBe(true);
    expect(result.material_cost_cents).toBe(40000);
    expect(result.labor_hours_estimate).toBe(24);
    expect(result.confidence).toBeGreaterThan(60);
  });

  it("defaults to prep level 5 when no keywords found", () => {
    const result = translateScope("Paint the living room");
    expect(result.prep_level).toBe(5);
  });

  it("returns warnings when sq ft cannot be determined", () => {
    const result = translateScope("Paint some rooms");
    expect(result.sq_ft).toBeNull();
    expect(result.warnings.some((w) => w.includes("square footage"))).toBe(true);
  });

  it("detects non-painting jobs", () => {
    const result = translateScope("Install new plumbing fixtures in the bathroom");
    expect(result.suggested_job_type).toBe("custom");
    // "bathroom" is a known room so sq_ft gets estimated
    expect(result.sq_ft).toBe(50);
  });

  it("handles comma-separated sq ft numbers", () => {
    const result = translateScope("Need 1,500 sq ft painted");
    expect(result.sq_ft).toBe(1500);
  });

  it("confidence is lower for ambiguous input", () => {
    const vague = translateScope("Paint some stuff");
    const detailed = translateScope("Paint 3 bedrooms and 2 bathrooms, 1200 sq ft, prep level 6, include ceiling and trim, $350 materials, 20 hours");

    expect(vague.confidence).toBeLessThan(detailed.confidence);
  });

  it("confidence is capped at 100", () => {
    const result = translateScope(
      "Paint 3 bedrooms at 1200 sq ft, prep level 6, include trim and ceiling, $350 materials, 20 hours"
    );
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});
