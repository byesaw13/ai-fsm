/**
 * Dovetails Services LLC — estimate pricing engine.
 *
 * All money values are in CENTS.
 * Internal costs are never passed to customer-facing output.
 */

import {
  LABOR_COST_CENTS_PER_HOUR,
  PAINTING_RATE_MIN_CENTS,
  PAINTING_RATE_LABOR_CENTS,
  PAINTING_TRIM_ADD_CENTS,
  PREP_LEVEL_MULTIPLIERS,
  MATERIAL_HANDLING_CLIENT_RATE,
  DEPOSIT_RATE,
  BALANCE_RATE,
  STANDARD_ESTIMATE_NOTES,
  STANDARD_PAYMENT_TERMS,
  STANDARD_DISCLAIMER,
  STANDARD_INVOICE_TERMS,
  DOCUMENT_STANDARD_VERSION,
  ESTIMATE_DOCUMENT_SECTIONS,
} from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// Painting estimate
// ---------------------------------------------------------------------------

export interface PaintingEstimateInput {
  sq_ft: number;
  prep_level: number;           // 1–10
  includes_trim: boolean;
  includes_ceiling: boolean;
  material_cost_cents: number;  // entered manually or calculated
  labor_hours_estimate: number; // internal only
  use_minimum_rate?: boolean;   // force min rate ($1.75) instead of standard
}

export interface PaintingEstimateResult {
  // Customer-facing
  labor_flat_rate_cents: number;   // what customer pays for labor (no hours shown)
  material_subtotal_cents: number;
  material_handling_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;

  // Internal only (never shown to customer)
  internal_labor_cost_cents: number;
  gross_margin_cents: number;
  gross_margin_pct: number;

  // Breakdown for builder UI
  base_sq_ft_rate_cents: number;   // rate per sq ft before multiplier
  effective_sq_ft_rate_cents: number;
  prep_multiplier: number;
  trim_add_cents: number;          // total trim add (sq_ft * 20 cents)
}

export function calculatePaintingEstimate(
  input: PaintingEstimateInput
): PaintingEstimateResult {
  const {
    sq_ft,
    prep_level,
    includes_trim,
    includes_ceiling,
    material_cost_cents,
    labor_hours_estimate,
    use_minimum_rate = false,
  } = input;

  const base_rate = use_minimum_rate
    ? PAINTING_RATE_MIN_CENTS
    : PAINTING_RATE_LABOR_CENTS;

  const prep_multiplier = PREP_LEVEL_MULTIPLIERS[Math.max(1, Math.min(10, prep_level))] ?? 1;
  const effective_rate = Math.round(base_rate * prep_multiplier);

  // Ceiling adds 30% more paintable surface at same rate
  const effective_sq_ft = includes_ceiling ? sq_ft * 1.3 : sq_ft;

  const trim_add_cents = includes_trim ? Math.round(sq_ft * PAINTING_TRIM_ADD_CENTS) : 0;

  const labor_flat_rate_cents = Math.round(effective_sq_ft * effective_rate) + trim_add_cents;

  const material_subtotal_cents = material_cost_cents;
  const material_handling_cents = Math.round(material_subtotal_cents * MATERIAL_HANDLING_CLIENT_RATE);

  const total_cents = labor_flat_rate_cents + material_subtotal_cents + material_handling_cents;
  const deposit_cents = Math.round(total_cents * DEPOSIT_RATE);
  const balance_cents = total_cents - deposit_cents;

  const internal_labor_cost_cents = Math.round(labor_hours_estimate * LABOR_COST_CENTS_PER_HOUR);
  const gross_margin_cents = labor_flat_rate_cents - internal_labor_cost_cents;
  const gross_margin_pct =
    labor_flat_rate_cents > 0
      ? Math.round((gross_margin_cents / labor_flat_rate_cents) * 100 * 10) / 10
      : 0;

  return {
    labor_flat_rate_cents,
    material_subtotal_cents,
    material_handling_cents,
    total_cents,
    deposit_cents,
    balance_cents,
    internal_labor_cost_cents,
    gross_margin_cents,
    gross_margin_pct,
    base_sq_ft_rate_cents: base_rate,
    effective_sq_ft_rate_cents: effective_rate,
    prep_multiplier,
    trim_add_cents,
  };
}

// ---------------------------------------------------------------------------
// Generic estimate totals
// ---------------------------------------------------------------------------

export interface LineItemInput {
  total_cents: number;
  line_item_type: "labor" | "materials" | "handling_fee" | "adjustment";
  visible_to_customer: boolean;
}

export interface EstimateTotals {
  subtotal_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  // Internal breakdown
  labor_cents: number;
  materials_cents: number;
  handling_cents: number;
  adjustment_cents: number;
}

export function calculateEstimateTotals(items: LineItemInput[]): EstimateTotals {
  const customer_items = items.filter((i) => i.visible_to_customer);

  const labor_cents = sum(customer_items, "labor");
  const materials_cents = sum(customer_items, "materials");
  const handling_cents = sum(customer_items, "handling_fee");
  const adjustment_cents = sum(customer_items, "adjustment");

  const subtotal_cents = labor_cents + materials_cents + handling_cents + adjustment_cents;
  const total_cents = subtotal_cents;
  const deposit_cents = Math.round(total_cents * DEPOSIT_RATE);
  const balance_cents = total_cents - deposit_cents;

  return {
    subtotal_cents,
    total_cents,
    deposit_cents,
    balance_cents,
    labor_cents,
    materials_cents,
    handling_cents,
    adjustment_cents,
  };
}

function sum(items: LineItemInput[], type: LineItemInput["line_item_type"]): number {
  return items.filter((i) => i.line_item_type === type).reduce((acc, i) => acc + i.total_cents, 0);
}

// ---------------------------------------------------------------------------
// Customer-facing text helpers
// ---------------------------------------------------------------------------

export function getStandardEstimateTerms() {
  return {
    version: DOCUMENT_STANDARD_VERSION,
    notes: STANDARD_ESTIMATE_NOTES,
    payment_terms: STANDARD_PAYMENT_TERMS,
    disclaimer: STANDARD_DISCLAIMER,
    sections: ESTIMATE_DOCUMENT_SECTIONS,
  };
}

export function getStandardInvoiceTerms() {
  return {
    version: DOCUMENT_STANDARD_VERSION,
    terms: STANDARD_INVOICE_TERMS,
  };
}

export function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
