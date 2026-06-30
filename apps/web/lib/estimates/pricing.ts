/**
 * Dovetails Services LLC — estimate pricing helpers.
 *
 * Painting computation is canonical in @ai-fsm/domain estimate-engine.
 * This module retains document helpers and generic totals.
 */

import {
  STANDARD_ESTIMATE_NOTES,
  STANDARD_PAYMENT_TERMS,
  STANDARD_DISCLAIMER,
  STANDARD_INVOICE_TERMS,
  DOCUMENT_STANDARD_VERSION,
  ESTIMATE_DOCUMENT_SECTIONS,
  computeSqftPaintingEstimate,
  type SqftPaintingInput,
  type SqftPaintingResult,
} from "@ai-fsm/domain";

export type PaintingEstimateInput = SqftPaintingInput;
export type PaintingEstimateResult = SqftPaintingResult;

/** @deprecated Use computeEstimate(sqftPaintingToSpec(...), CURRENT_RULES) from @ai-fsm/domain */
export function calculatePaintingEstimate(input: PaintingEstimateInput): PaintingEstimateResult {
  return computeSqftPaintingEstimate(input);
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
  const deposit_cents = 0;
  const balance_cents = total_cents;

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

export { formatCents } from "@/lib/money";