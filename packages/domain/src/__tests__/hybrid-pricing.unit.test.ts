import { describe, expect, it } from "vitest";
import {
  compute3LayerHybridEstimate,
  computeHybridEstimateItem,
  findLayer1Benchmark,
  getLayer2MaterialCost,
  UnmatchedBenchmarkError,
} from "../hybrid-pricing";

describe("3-Layer Hybrid Estimating Engine", () => {
  it("finds Layer 1 standard trade benchmark for PVC garage trim", () => {
    const b = findLayer1Benchmark("TRIM.GARAGE.PVC");
    expect(b).toBeDefined();
    expect(b?.csiCode).toBe("06 20 23.10");
    expect(b?.standardLaborHoursPerUnit).toBe(0.075);
  });

  // Regression: findLayer1Benchmark used to silently fall back to
  // LAYER1_STANDARDS_CATALOG[0] (garage-door PVC trim) for ANY unmatched
  // query, producing a wrong customer-facing price with no signal it
  // happened. It must now throw a named error instead.
  it("throws UnmatchedBenchmarkError for an unrecognized item, never silently substitutes an unrelated trade", () => {
    expect(() => findLayer1Benchmark("HVAC.DUCTLESS.MINISPLIT.INSTALL")).toThrow(UnmatchedBenchmarkError);
  });

  it("degrades to a clearly-flagged generic estimate for an unmatched item, without crashing the batch", () => {
    const item = computeHybridEstimateItem({
      codeOrDescription: "HVAC.DUCTLESS.MINISPLIT.INSTALL",
      quantity: 1,
    });

    expect(item.layer1Unmatched).toBe(true);
    expect(item.description).toContain("verify manually");
    expect(item.breakdownSummary).toContain("⚠ UNMATCHED");
    expect(item.finalLineTotalCents).toBeGreaterThan(0);
  });

  it("a multi-item estimate with one unmatched item still returns all items, only the unmatched one flagged", () => {
    const calc = compute3LayerHybridEstimate([
      { codeOrDescription: "TRIM.GARAGE.PVC", quantity: 24 },
      { codeOrDescription: "HVAC.DUCTLESS.MINISPLIT.INSTALL", quantity: 1 },
    ]);

    expect(calc.lineItems).toHaveLength(2);
    expect(calc.lineItems[0]!.layer1Unmatched).toBeUndefined();
    expect(calc.lineItems[1]!.layer1Unmatched).toBe(true);
  });

  it("calculates Layer 2 distributor material + consumables costs for PVC trim", () => {
    const m = getLayer2MaterialCost("TRIM.GARAGE.PVC", 24); // 24 LF garage trim
    expect(m.materialCents).toBeGreaterThan(0);
    expect(m.consumablesCents).toBe(1150 + 3850); // OSI caulk + Cortex screws
    expect(m.matchedItems.some((i) => i.sku === "HD-OSI-QUAD-MAX")).toBe(true);
  });

  it("computes single hybrid item estimate incorporating Layer 1, Layer 2, and Layer 3", () => {
    const item = computeHybridEstimateItem({
      codeOrDescription: "TRIM.GARAGE.PVC",
      quantity: 24, // 24 LF trim
      isOldHouse: true,
    });

    expect(item.layer1AdjustedLaborHours).toBeGreaterThan(item.layer1BaseLaborHours);
    // Neutral by default (see engine.ts: DOVETAILS_DEFAULT_CALIBRATION comment
    // — the seed benchmark run had N=1 clean sample, not enough for a real
    // per-trade multiplier), until real calibration data justifies otherwise.
    expect(item.layer3LocalCalibrationFactor).toBe(1.00);
    expect(item.finalLineTotalCents).toBeGreaterThan(0);
    expect(item.breakdownSummary).toContain("Layer 1");
    expect(item.breakdownSummary).toContain("Layer 2");
    expect(item.breakdownSummary).toContain("Layer 3");
  });

  it("computes complete 3-layer hybrid estimate for multi-task project", () => {
    const calc = compute3LayerHybridEstimate([
      { codeOrDescription: "TRIM.GARAGE.PVC", quantity: 24 },
      { codeOrDescription: "LIGHTING.CHANDELIER.HANG", quantity: 1, isHighCeiling20ft: true },
    ]);

    expect(calc.lineItems).toHaveLength(2);
    expect(calc.totalLaborHours).toBeGreaterThan(3.0);
    expect(calc.totalLaborCostCents).toBeGreaterThan(0);
    expect(calc.totalMaterialCostCents).toBeGreaterThan(0);
    expect(calc.transparencyNotes).toHaveLength(3);
    expect(calc.transparencyNotes[0]).toContain("Layer 1");
    expect(calc.transparencyNotes[1]).toContain("Layer 2");
    expect(calc.transparencyNotes[2]).toContain("Layer 3");
  });
});
