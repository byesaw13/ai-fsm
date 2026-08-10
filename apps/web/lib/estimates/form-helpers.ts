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

// ---------------------------------------------------------------------------
// Shared types for estimate forms (new + edit) and their hooks
// ---------------------------------------------------------------------------

export interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
  price_book_id?: string;
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
