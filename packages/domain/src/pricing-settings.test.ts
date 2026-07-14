import { describe, it, expect } from "vitest";
import {
  DEFAULT_PRICING_SETTINGS,
  billingRateCentsForState,
  buildPricingRules,
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
});
