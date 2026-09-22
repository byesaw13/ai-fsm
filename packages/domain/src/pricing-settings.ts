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

/** Per-person cost inputs from the users row (migration 189). */
export interface WorkerCostProfile {
  cost_cents_per_hour: number | null | undefined;
  burden_multiplier: number | null | undefined;
}

/**
 * Burdened internal cost rate for one worker: their pay rate × burden multiplier.
 * The burden multiplier applies ONLY to a worker's own pay rate. When the worker
 * has no rate set, we return the account cost clock unchanged — that value is
 * already the burdened final fallback, so re-applying the multiplier would
 * double-burden it. Single source of truth for "what an hour of this person's
 * labor costs us"; replaces the scattered LABOR_COST_CENTS_PER_HOUR for actuals.
 */
export function workerCostRateCentsPerHour(
  worker: WorkerCostProfile,
  accountCostCentsPerHour: number = DEFAULT_PRICING_SETTINGS.labor_cost_cents_per_hour
): number {
  const hasOwnRate =
    worker.cost_cents_per_hour != null && worker.cost_cents_per_hour >= 0;
  if (!hasOwnRate) return accountCostCentsPerHour;
  const burden =
    worker.burden_multiplier != null && worker.burden_multiplier > 0
      ? worker.burden_multiplier
      : 1;
  return Math.round(worker.cost_cents_per_hour! * burden);
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

export function calculateFinancialComparison(opts: {
  laborCostCents: number | null;
  materialCostCents: number | null;
  totalQuoteCents: number;
  laborCostRateCents: number;
  laborBillingRateCents: number;
}) {
  if (opts.laborCostCents === null || opts.materialCostCents === null) return null;
  const materialHandlingCents = Math.round(opts.materialCostCents * 0.15);
  const totalDirectCostCents = opts.laborCostCents + opts.materialCostCents;
  const grossProfitCents = opts.totalQuoteCents - totalDirectCostCents;
  const grossMarginPct = opts.totalQuoteCents > 0 ? Math.round((grossProfitCents / opts.totalQuoteCents) * 1000) / 10 : 0;
  const effectiveHours = opts.laborCostRateCents > 0 ? Math.round((opts.laborCostCents / opts.laborCostRateCents) * 10) / 10 : 0;
  const tmEstimatedLaborHrs = effectiveHours > 0 ? effectiveHours : 3;
  const tmTotalQuoteCents = Math.round(tmEstimatedLaborHrs * opts.laborBillingRateCents) + opts.materialCostCents + materialHandlingCents;
  const tmGrossProfitCents = tmTotalQuoteCents - totalDirectCostCents;
  const tmGrossMarginPct = tmTotalQuoteCents > 0 ? Math.round((tmGrossProfitCents / tmTotalQuoteCents) * 1000) / 10 : 0;
  return { materialHandlingCents, totalDirectCostCents, grossProfitCents, grossMarginPct, effectiveHours, tmEstimatedLaborHrs, tmTotalQuoteCents, tmGrossProfitCents, tmGrossMarginPct };
}
