import type { PrepLevel, ShoppingList, PaintingProjectResult } from "@ai-fsm/domain";
import { buildShoppingList } from "@ai-fsm/domain";
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
 * Build a ShoppingList from a PaintingProjectResult's shopping_summary.
 * Called after room-by-room painting computation to preserve actual gallon counts.
 * This is the authoritative source for painting shopping lists — it knows exact
 * gallons by grade and primer gallons, which buildManualShoppingList() cannot derive.
 */
export function buildShoppingListFromPaintingSummary(
  result: PaintingProjectResult
): ShoppingList | null {
  if (!result.shopping_summary.length) return null;

  // Convert shopping_summary items into ComputedMaterial-like objects grouped by section
  const sections: ShoppingList["sections"] = [
    {
      section: "Paint & Supplies",
      computed_items: [],
      specified_items: [],
      section_total_cents: result.shopping_summary.reduce((s, i) => s + i.cost_cents, 0),
    },
  ];

  // Embed summary items as specified_items (they have name, qty, unit, cost)
  // but represent computed results from the painting engine — not user-specified products
  sections[0].specified_items = result.shopping_summary.map((item) => ({
    name: item.item,
    sku: null,
    coverage_per_unit: null,
    unit_label: item.unit,
    unit_cost_cents: item.qty > 0 ? Math.round(item.cost_cents / item.qty) : null,
    quantity_needed: item.qty,
    waste_factor: 1.1,
    units_to_order: item.qty,
    store_section: "Paint & Supplies",
    service_code: "5012",
    notes: null,
  }));

  const total = result.shopping_summary.reduce((s, i) => s + i.cost_cents, 0);

  return {
    sections,
    total_catalog_cost_cents: 0,
    total_specified_cost_cents: total,
    generated_at: new Date().toISOString(),
  };
}

export function buildManualShoppingList(
  priceBookItems: PriceBookEntry[],
  scopeResults: Record<string, ScopeBuilderResult>
): ShoppingList | null {
  const computedByService = priceBookItems
    .map((item) => ({
      service_name: item.service.name,
      materials: scopeResults[item.instanceId]?.materials ?? [],
    }))
    .filter((s) => s.materials.length > 0);
  if (computedByService.length === 0) return null;
  return buildShoppingList(computedByService, []);
}

export const DEFAULT_TIERS: OptionTier[] = [
  { label: "Good", description: "Essential services to get the job done", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Better", description: "Recommended upgrade with better materials", is_recommended: true, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Best", description: "Premium service with full coverage", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
];
