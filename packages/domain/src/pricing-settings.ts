/**
 * Account-level labor pricing settings.
 * Constants in dovetails.ts remain the fallback defaults for offline/unit tests.
 */

import {
  LABOR_COST_CENTS_PER_HOUR,
  LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  BUNDLE_MARGIN_FLOOR,
  MA_LABOR_RATE_DELTA,
  MINIMUM_SERVICE_FEE_CENTS,
  HALF_DAY_RATE_CENTS,
  FULL_DAY_RATE_CENTS,
} from "./dovetails";
import type { PricingRules } from "./estimate-engine/types";
import { CURRENT_RULES, RULES_VERSION } from "./estimate-engine/rules";

export interface BusinessPricingSettings {
  /** Internal cost clock (owner pay / burdened cost). Never customer-facing. */
  labor_cost_cents_per_hour: number;
  /** Customer-facing T&M / add-on labor rate (NH baseline). */
  labor_billing_cents_per_hour: number;
  /** Gross margin floor 0–1 (e.g. 0.30 = 30%). */
  margin_floor_pct: number;
  /** MA premium on billing rate (e.g. 0.15 = +15%). */
  ma_labor_rate_delta: number;
  minimum_service_fee_cents: number;
  half_day_rate_cents: number;
  full_day_rate_cents: number;
}

/** Seed / fallback when no DB row exists. Cost default $50 matches solo owner pay. */
export const DEFAULT_PRICING_SETTINGS: BusinessPricingSettings = {
  labor_cost_cents_per_hour: LABOR_COST_CENTS_PER_HOUR,
  labor_billing_cents_per_hour: LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  margin_floor_pct: BUNDLE_MARGIN_FLOOR,
  ma_labor_rate_delta: MA_LABOR_RATE_DELTA,
  minimum_service_fee_cents: MINIMUM_SERVICE_FEE_CENTS,
  half_day_rate_cents: HALF_DAY_RATE_CENTS,
  full_day_rate_cents: FULL_DAY_RATE_CENTS,
};

/** Customer bill rate for a job state (NH baseline or MA premium). */
export function billingRateCentsForState(
  settings: BusinessPricingSettings,
  state: string | null | undefined
): number {
  const st = (state ?? "").trim().toUpperCase();
  const isMa = st === "MA" || st === "MASSACHUSETTS";
  if (!isMa) return settings.labor_billing_cents_per_hour;
  return Math.round(
    settings.labor_billing_cents_per_hour * (1 + settings.ma_labor_rate_delta)
  );
}

/** Build engine PricingRules with account labor rates + margin floor. */
export function buildPricingRules(
  settings: BusinessPricingSettings = DEFAULT_PRICING_SETTINGS
): PricingRules {
  return {
    ...CURRENT_RULES,
    version: `${RULES_VERSION}+acct`,
    laborCostCentsPerHour: settings.labor_cost_cents_per_hour,
    laborBillingCentsPerHour: settings.labor_billing_cents_per_hour,
    minimumTotalCents: settings.minimum_service_fee_cents,
    marginFloor: settings.margin_floor_pct,
  };
}
