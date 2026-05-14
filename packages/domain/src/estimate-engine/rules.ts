import type { PricingRules } from "./types";
import {
  LABOR_COST_CENTS_PER_HOUR,
  LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  MATERIAL_HANDLING_RATE,
  DEPOSIT_RATE,
  MINIMUM_SERVICE_FEE_CENTS,
  BUNDLE_MARGIN_FLOOR,
  PAINTING_RATE_STANDARD_CENTS,
  PAINTING_TRIM_ADD_CENTS,
} from "../dovetails";

export const ENGINE_VERSION = "2026.05";
export const RULES_VERSION = "2026.05.1";

export const CURRENT_RULES: PricingRules = {
  version: RULES_VERSION,
  laborCostCentsPerHour: LABOR_COST_CENTS_PER_HOUR,
  laborBillingCentsPerHour: LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  materialHandlingRate: MATERIAL_HANDLING_RATE,
  depositRate: DEPOSIT_RATE,
  minimumTotalCents: MINIMUM_SERVICE_FEE_CENTS,
  marginFloor: BUNDLE_MARGIN_FLOOR,

  painting: {
    sqftRateCents: {
      walls: PAINTING_RATE_STANDARD_CENTS,      // $2.05/sqft
      ceiling: PAINTING_RATE_STANDARD_CENTS,    // $2.05/sqft
      trim: PAINTING_TRIM_ADD_CENTS,            // $0.20/lf
      door: 55_00,                              // $55/door
      window: 35_00,                            // $35/window
      cabinet: 75_00,                           // $75/cabinet face
      exterior_siding: PAINTING_RATE_STANDARD_CENTS,
      deck: 175,                                // $1.75/sqft
    },
    prepMultipliers: {
      none: 1.00,
      minor: 1.00,   // standard prep is included in the base rate
      moderate: 1.14,
      major: 1.38,
    },
    primeMultiplier: 0.20,
    textureMatchMultiplier: 0.25,
    additionalCoatMultiplier: 0.70,
    coverageSqftPerGallon: 350,
    paintCentsPerGallon: {
      economy: 35_00,
      standard: 55_00,
      premium: 75_00,
      designer: 95_00,
    },
  },

  tripFeeCents: 75_00,
};
