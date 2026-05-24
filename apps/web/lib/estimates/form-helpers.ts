import type { PrepLevel } from "@ai-fsm/domain";

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

export const DEFAULT_TIERS: OptionTier[] = [
  { label: "Good", description: "Essential services to get the job done", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Better", description: "Recommended upgrade with better materials", is_recommended: true, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Best", description: "Premium service with full coverage", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
];
