import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRICING_SETTINGS,
  billingRateCentsForState,
  buildPricingRules,
  calculateFinancialComparison,
  workerCostRateCentsPerHour,
} from "./pricing-settings";

describe("pricing-settings", () => {
  it("defaults cost to $50 and bill to $115", () => {
    expect(DEFAULT_PRICING_SETTINGS.labor_cost_cents_per_hour).toBe(50_00);
    expect(DEFAULT_PRICING_SETTINGS.labor_billing_cents_per_hour).toBe(115_00);
  });

  it("pure T&M margin clears 30% floor at $50 cost / $115 bill", () => {
    const { labor_cost_cents_per_hour: cost, labor_billing_cents_per_hour: bill } =
      DEFAULT_PRICING_SETTINGS;
    const margin = (bill - cost) / bill;
    expect(margin).toBeGreaterThanOrEqual(DEFAULT_PRICING_SETTINGS.margin_floor_pct);
    // ~56.5%
    expect(margin).toBeGreaterThan(0.55);
  });

  it("applies MA premium to billing rate", () => {
    const nh = billingRateCentsForState(DEFAULT_PRICING_SETTINGS, "NH");
    const ma = billingRateCentsForState(DEFAULT_PRICING_SETTINGS, "MA");
    expect(nh).toBe(115_00);
    expect(ma).toBe(Math.round(115_00 * 1.15));
  });

  it("buildPricingRules injects account rates into engine rules", () => {
    const rules = buildPricingRules({
      ...DEFAULT_PRICING_SETTINGS,
      labor_cost_cents_per_hour: 45_00,
      labor_billing_cents_per_hour: 120_00,
      margin_floor_pct: 0.25,
    });
    expect(rules.laborCostCentsPerHour).toBe(45_00);
    expect(rules.laborBillingCentsPerHour).toBe(120_00);
    expect(rules.marginFloor).toBe(0.25);
  });

  it("preserves unknown costs and uses configured rates", () => {
    expect(calculateFinancialComparison({ laborCostCents: null, materialCostCents: 10_000, totalQuoteCents: 100_000, laborCostRateCents: 5_000, laborBillingRateCents: 12_000 })).toBeNull();
    expect(calculateFinancialComparison({ laborCostCents: 10_000, materialCostCents: 10_000, totalQuoteCents: 100_000, laborCostRateCents: 5_000, laborBillingRateCents: 12_000 })).toMatchObject({ effectiveHours: 2, tmTotalQuoteCents: 35_500 });
  });

  describe("workerCostRateCentsPerHour", () => {
    it("solo owner with no rate falls back to the account cost clock ($50)", () => {
      expect(workerCostRateCentsPerHour({ cost_cents_per_hour: null, burden_multiplier: null })).toBe(50_00);
    });

    it("uses the worker's own pay rate when set", () => {
      expect(workerCostRateCentsPerHour({ cost_cents_per_hour: 40_00, burden_multiplier: 1 })).toBe(40_00);
    });

    it("applies the burden multiplier to pay (e.g. $40 pay × 1.35 = $54)", () => {
      expect(workerCostRateCentsPerHour({ cost_cents_per_hour: 40_00, burden_multiplier: 1.35 })).toBe(54_00);
    });

    it("falls back to a provided account rate without re-applying burden (already burdened)", () => {
      // No own pay rate → return the account cost clock as-is; burden must NOT double-apply.
      expect(workerCostRateCentsPerHour({ cost_cents_per_hour: null, burden_multiplier: 1.2 }, 60_00)).toBe(60_00);
    });

    it("ignores non-positive burden and negative rate", () => {
      expect(workerCostRateCentsPerHour({ cost_cents_per_hour: -5, burden_multiplier: 0 }, 50_00)).toBe(50_00);
    });
  });
});
