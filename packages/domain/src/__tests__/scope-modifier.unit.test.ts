import { describe, it, expect } from "vitest";
import { computeScopeModifier } from "../scope";
import type { ComplexityFactor, ComplexityValues } from "../scope";

function makeMultiplier(key: string, value: number): ComplexityFactor {
  return { id: key, key, label: key, description: null, factor_type: "multiplier", default_value: value, sort_order: 0 };
}

function makeAdder(key: string, cents: number): ComplexityFactor {
  return { id: key, key, label: key, description: null, factor_type: "adder", default_value: cents, sort_order: 0 };
}

describe("computeScopeModifier", () => {
  it("returns 1.0 with no active factors", () => {
    const { multiplier, adderCents } = computeScopeModifier(
      [makeMultiplier("big", 1.5)],
      { big: false }
    );
    expect(multiplier).toBe(1.0);
    expect(adderCents).toBe(0);
  });

  it("applies a single multiplier at full surplus", () => {
    const { multiplier } = computeScopeModifier(
      [makeMultiplier("a", 1.25)],
      { a: true }
    );
    expect(multiplier).toBeCloseTo(1.25, 5);
  });

  it("applies second multiplier at 60% of its surplus", () => {
    // factor a: +0.25 surplus at 100% → ×1.25
    // factor b: +0.20 surplus at 60%  → ×(1 + 0.20×0.6) = ×1.12
    // combined: 1.25 × 1.12 = 1.40
    const { multiplier } = computeScopeModifier(
      [makeMultiplier("a", 1.25), makeMultiplier("b", 1.20)],
      { a: true, b: true }
    );
    expect(multiplier).toBeCloseTo(1.25 * (1 + 0.20 * 0.6), 5);
  });

  it("applies third+ multipliers at 30% of their surplus", () => {
    const factors = [
      makeMultiplier("a", 1.25),
      makeMultiplier("b", 1.20),
      makeMultiplier("c", 1.15),
    ];
    const applied: ComplexityValues = { a: true, b: true, c: true };
    const { multiplier } = computeScopeModifier(factors, applied);
    const expected = 1.25 * (1 + 0.20 * 0.6) * (1 + 0.15 * 0.3);
    expect(multiplier).toBeCloseTo(expected, 5);
  });

  it("caps multiplier at 1.75 regardless of factor count", () => {
    const factors = [
      makeMultiplier("a", 1.5),
      makeMultiplier("b", 1.5),
      makeMultiplier("c", 1.5),
      makeMultiplier("d", 1.5),
    ];
    const applied: ComplexityValues = { a: true, b: true, c: true, d: true };
    const { multiplier } = computeScopeModifier(factors, applied);
    expect(multiplier).toBe(1.75);
  });

  it("orders factors by surplus magnitude before weighting", () => {
    // Larger surplus (0.50) should be at index 0 (full weight),
    // smaller surplus (0.10) at index 1 (60%).
    const { multiplier: m1 } = computeScopeModifier(
      [makeMultiplier("small", 1.10), makeMultiplier("big", 1.50)],
      { small: true, big: true }
    );
    // If ordering is correct: big first → 1.50 × (1 + 0.10×0.6) = 1.50 × 1.06 = 1.59
    expect(m1).toBeCloseTo(1.50 * (1 + 0.10 * 0.6), 5);
  });

  it("passes through adder factors unchanged regardless of multiplier count", () => {
    const { multiplier, adderCents } = computeScopeModifier(
      [makeMultiplier("a", 1.25), makeAdder("fee", 5000)],
      { a: true, fee: true }
    );
    expect(multiplier).toBeCloseTo(1.25, 5);
    expect(adderCents).toBe(5000);
  });

  it("accumulates multiple adder factors", () => {
    const { adderCents } = computeScopeModifier(
      [makeAdder("fee1", 2000), makeAdder("fee2", 3000)],
      { fee1: true, fee2: true }
    );
    expect(adderCents).toBe(5000);
  });
});
