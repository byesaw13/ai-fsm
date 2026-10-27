import type { PrepLevel, ShoppingList, EstimateResult, RoomSpec, ProjectOptions } from "@ai-fsm/domain";
import {
  buildShoppingList,
  buildShoppingListFromEstimateResult,
  computeDoorHardwareTakeoff,
  mergeDoorHardwareTakeoffIntoShoppingList,
  includesDoorHardwareCode,
  DOOR_HARDWARE_PRICE_BOOK_CODE,
} from "@ai-fsm/domain";
import type { ScopeBuilderResult } from "@/components/ScopeBuilder";
import type { PriceBookEntry } from "@/app/app/estimates/new/hooks/useEstimatePriceBook";
import { materialMarkupPct } from "@/lib/estimates/cost-split";
import { formHourColumns, formatHourInput, type HourSource } from "@/lib/estimates/stored-hours";

// ---------------------------------------------------------------------------
// Shared types for estimate forms (new + edit) and their hooks
// ---------------------------------------------------------------------------

export interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
  price_book_id?: string;
  /** Kept from the saved line so an edit-form save does not reclassify it. */
  line_item_type?: "labor" | "materials" | "handling_fee" | "adjustment";
  /** What this materials line cost. The customer price stays on unit_price. */
  unit_cost_cents?: number | null;
  visible_to_customer?: boolean;
  adjustment_type?: string | null;
  /** Prepared-scope group that produced the line; Apply to quote replaces it (TASK-179). */
  prepared_group_key?: string | null;
  /** Person-hours. Blank strings stay null on save. */
  hours_low?: string;
  hours_high?: string;
  hours_source?: HourSource | null;
  /**
   * Links this flattened row back to its AiMaterialsDeltaItem (by `key`),
   * when it came from the AI materials generator. Lets submit-time
   * reconciliation detect if the founder edited/removed the row after
   * "Add to Estimate" (TASK T1, materials trust calibration).
   */
  ai_delta_key?: string;
}

export interface OptionTier {
  label: string;
  description: string;
  is_recommended: boolean;
  line_items: LineItemRow[];
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

export function parseCents(dollars: string): number {
  const n = parseFloat(dollars);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function lineTotal(row: LineItemRow): number {
  const qty = parseFloat(row.quantity);
  if (isNaN(qty) || qty <= 0) return 0;
  return Math.round(qty * parseCents(row.unit_price));
}

/** Price that still receives the form's automatic handling. A marked-up line contributes nothing. */
export function handlingPriceCents(row: LineItemRow): number {
  const price = parseCents(row.unit_price);
  if (materialMarkupPct({ unit_price_cents: price, unit_cost_cents: row.unit_cost_cents ?? null }) != null) return 0;
  return lineTotal(row);
}

/** Materials generator hand-off: one line, price equal to cost, cost kept. */
export function generatorMaterialRow(
  item: { name: string; brand?: string | null; quantity: number; unit: string; total_cost_cents: number },
  aiDeltaKey?: string,
): LineItemRow {
  return {
    description: `${item.name}${item.brand ? ` (${item.brand})` : ""} — ${item.quantity} ${item.unit}`,
    quantity: "1",
    unit_price: (item.total_cost_cents / 100).toFixed(2),
    line_item_type: "materials",
    unit_cost_cents: item.total_cost_cents,
    ...(aiDeltaKey ? { ai_delta_key: aiDeltaKey } : {}),
  };
}

export function mapPrepLevel(level: number): PrepLevel {
  if (level <= 3) return "none";
  if (level <= 5) return "minor";
  if (level <= 7) return "moderate";
  return "major";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unit_price: "0.00" };

/** A saved line item as the edit form receives it. */
export interface SavedLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents?: number | null;
  line_item_type?: LineItemRow["line_item_type"];
  visible_to_customer?: boolean;
  adjustment_type?: string | null;
  price_book_id?: string | null;
  prepared_group_key?: string | null;
  hours_low?: number | string | null;
  hours_high?: number | string | null;
  hours_source?: HourSource | null;
}

/** Saved line → editable row, keeping the fields the form does not show. */
export function savedLineToRow(item: SavedLineItem): LineItemRow {
  return {
    description: item.description,
    quantity: String(item.quantity),
    unit_price: (item.unit_price_cents / 100).toFixed(2),
    ...(item.unit_cost_cents != null ? { unit_cost_cents: item.unit_cost_cents } : {}),
    ...(item.price_book_id ? { price_book_id: item.price_book_id } : {}),
    ...(item.line_item_type ? { line_item_type: item.line_item_type } : {}),
    ...(item.visible_to_customer !== undefined ? { visible_to_customer: item.visible_to_customer } : {}),
    ...(item.adjustment_type ? { adjustment_type: item.adjustment_type } : {}),
    ...(item.prepared_group_key ? { prepared_group_key: item.prepared_group_key } : {}),
    ...(item.hours_low != null || item.hours_high != null
      ? {
          hours_low: formatHourInput(item.hours_low),
          hours_high: formatHourInput(item.hours_high),
          hours_source: item.hours_source ?? null,
        }
      : {}),
  };
}

/**
 * Editable row → PATCH line item. Type, visibility, adjustment type, price-book
 * link and prepared group are sent back as they were, so saving the form never
 * turns a materials line into labor or detaches a prepared line. New rows take
 * the API defaults.
 */
export function rowToLineItemPayload(row: LineItemRow, index: number) {
  return {
    description: row.description,
    quantity: parseFloat(row.quantity) || 1,
    unit_price_cents: parseCents(row.unit_price),
    sort_order: index,
    ...(row.unit_cost_cents != null ? { unit_cost_cents: row.unit_cost_cents } : {}),
    ...(row.line_item_type ? { line_item_type: row.line_item_type } : {}),
    ...(row.visible_to_customer !== undefined ? { visible_to_customer: row.visible_to_customer } : {}),
    ...(row.adjustment_type ? { adjustment_type: row.adjustment_type } : {}),
    ...(row.price_book_id ? { price_book_id: row.price_book_id } : {}),
    ...(row.prepared_group_key ? { prepared_group_key: row.prepared_group_key } : {}),
    ...formHourColumns(row),
  };
}

export const PREP_LEVEL_LABELS: Record<number, string> = {
  1: "1 — Light dusting",
  2: "2 — Wipe down",
  3: "3 — Minor touch-ups",
  4: "4 — Small patch repairs",
  5: "5 — Standard prep",
  6: "6 — Moderate repair",
  7: "7 — Heavy patching",
  8: "8 — Extensive repair",
  9: "9 — Major restoration",
  10: "10 — Full restoration",
};

export const STEP_LABELS = ["Who & What", "Pricing", "Adjustments", "Review & Send"] as const;

// ---------------------------------------------------------------------------
// Shopping list — generate for manual (non-AI) estimates
// ---------------------------------------------------------------------------

/**
 * Build a ShoppingList from scope builder state captured during estimate creation.
 * Returns null when no scope materials have been computed yet.
 * Used at submit time so ALL estimates (not just AI drafts) get a shopping_list_json.
 */
/**
 * Build a ShoppingList from an engine EstimateResult and source room specs.
 * @deprecated Use buildShoppingListFromEstimateResult from @ai-fsm/domain directly.
 */
export function buildShoppingListFromPaintingSummary(
  result: EstimateResult,
  rooms: RoomSpec[],
  options?: ProjectOptions
): ShoppingList | null {
  return buildShoppingListFromEstimateResult(result, rooms, options);
}

export function buildManualShoppingList(
  priceBookItems: PriceBookEntry[],
  scopeResults: Record<string, ScopeBuilderResult>
): ShoppingList | null {
  // TASK-103: price_book 1007 must NOT pull category-wide general_repairs
  // materials (joint compound / mesh tape). Use deterministic takeoff only.
  const computedByService = priceBookItems
    .filter((item) => item.service.code !== DOOR_HARDWARE_PRICE_BOOK_CODE)
    .map((item) => ({
      service_name: item.service.name,
      materials: scopeResults[item.instanceId]?.materials ?? [],
    }))
    .filter((s) => s.materials.length > 0);

  // Door hardware takeoff can produce a list even when other scope materials
  // are empty — do not early-return before that merge.
  const base =
    computedByService.length > 0 ? buildShoppingList(computedByService, []) : null;

  const codes = priceBookItems.map((i) => i.service.code);
  if (!includesDoorHardwareCode(codes)) {
    return base;
  }

  // Default pilot inputs: one unit per 1007 line item; Dovetails-supplied lockset.
  // Structured assessment inputs can refine these later.
  const unitCount = priceBookItems.filter(
    (i) => i.service.code === DOOR_HARDWARE_PRICE_BOOK_CODE,
  ).length || 1;

  const takeoff = computeDoorHardwareTakeoff({
    hardwareType: "lockset",
    unitCount,
    customerSupplied: false,
  });
  return mergeDoorHardwareTakeoffIntoShoppingList(base, takeoff);
}

export const DEFAULT_TIERS: OptionTier[] = [
  { label: "Good", description: "Essential services to get the job done", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Better", description: "Recommended upgrade with better materials", is_recommended: true, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Best", description: "Premium service with full coverage", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
];
