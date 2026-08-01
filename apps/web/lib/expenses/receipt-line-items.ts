export const RECEIPT_LINE_ITEMS_PROMPT = `You are a receipt parser for a small handyman and woodworking business (Dovetails Services LLC).

Extract every purchased line item from this receipt image and return ONLY valid JSON (no markdown):

{
  "vendor_name": "string or null",
  "amount_cents": number or null — receipt total in cents,
  "expense_date": "YYYY-MM-DD or null",
  "category": "materials|tools|fuel|... or null",
  "notes": "string or null — short trip summary",
  "line_items": [
    {
      "name": "string — product description",
      "quantity": number — how many units purchased (default 1),
      "unit_cost_cents": number — PRICE PER ONE UNIT in cents (integer), NEVER the line total,
      "line_total_cents": number — extended line amount in cents (quantity × unit), integer,
      "sku": "string or null"
    }
  ]
}

Rules:
- Include every billable SKU row; skip tax lines, subtotal rows, and payment tender lines.
- quantity: use the count printed on the receipt (e.g. "3 @" / "3 x" / qty column). Do not collapse multi-qty lines into one unit.
- unit_cost_cents is ALWAYS the per-unit net price after line discounts — NOT the extended/line total.
- line_total_cents is the amount charged for that whole line (quantity × unit). Prefer reading it from the receipt; otherwise compute quantity × unit_cost_cents.
- CRITICAL example: 3 items @ $10.00 each → quantity: 3, unit_cost_cents: 1000, line_total_cents: 3000.
  WRONG: quantity: 1, unit_cost_cents: 3000 (that treats the line total as a single-unit price).
- Another example: 8 LF moulding @ $1.44/ft = $11.52 → quantity: 8, unit_cost_cents: 144, line_total_cents: 1152.
- Sum of line_total_cents should be close to amount_cents (before tax when tax is separate).
- materials category for lumber, hardware, paint, fasteners, trim, etc.`;

export type ParsedReceiptLineItem = {
  name: string;
  quantity: number;
  unit_cost_cents: number;
  /** Extended line amount (qty × unit). Optional from the model; used to correct unit price. */
  line_total_cents?: number | null;
  sku?: string | null;
};

export type ParsedReceipt = {
  vendor_name?: string | null;
  amount_cents?: number | null;
  expense_date?: string | null;
  category?: string | null;
  notes?: string | null;
  line_items?: ParsedReceiptLineItem[];
};

const CENTS_TOLERANCE = 2;

/**
 * Correct unit price when the model put the line total in unit_cost_cents.
 *
 * Classic bug: qty=3, unit=$30 (line total) instead of qty=3, unit=$10.
 * With line_total: if unit ≈ line_total and qty > 1, unit = line_total / qty.
 * Without line_total but unit * qty is wildly large vs unit alone — only line_total path is safe.
 */
export function coerceUnitCostCents(input: {
  quantity: number;
  unit_cost_cents: number;
  line_total_cents?: number | null;
}): number {
  const qty = input.quantity > 0 ? input.quantity : 1;
  let unit = Math.round(input.unit_cost_cents);
  if (unit <= 0) return 0;

  const hasTotal =
    typeof input.line_total_cents === "number" &&
    Number.isFinite(input.line_total_cents) &&
    input.line_total_cents > 0;
  const total = hasTotal ? Math.round(input.line_total_cents as number) : null;

  if (total != null) {
    const product = Math.round(unit * qty);
    if (Math.abs(product - total) <= CENTS_TOLERANCE) {
      return unit;
    }
    // unit was set to the line total (or near it) while qty > 1
    if (qty > 1 && Math.abs(unit - total) <= CENTS_TOLERANCE) {
      return Math.max(1, Math.round(total / qty));
    }
    // Prefer deriving unit from extended total when product is inconsistent
    if (qty > 1) {
      const derived = Math.round(total / qty);
      if (derived > 0 && Math.abs(derived * qty - total) <= CENTS_TOLERANCE) {
        return derived;
      }
    }
    // qty 1: if unit and total disagree, prefer total as unit (single unit line)
    if (qty === 1 && Math.abs(unit - total) > CENTS_TOLERANCE) {
      return total;
    }
  }

  return unit;
}

export function normalizeParsedReceiptLineItems(
  raw: ParsedReceiptLineItem[] | undefined,
): ParsedReceiptLineItem[] {
  if (!raw?.length) return [];
  return raw
    .map((item) => {
      const name = item.name?.trim() ?? "";
      const quantity =
        typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
      const rawUnit =
        typeof item.unit_cost_cents === "number" && item.unit_cost_cents > 0
          ? Math.round(item.unit_cost_cents)
          : 0;
      const rawTotal =
        typeof item.line_total_cents === "number" && item.line_total_cents > 0
          ? Math.round(item.line_total_cents)
          : null;

      // If unit missing but line total present, derive unit
      let unit_cost_cents = rawUnit;
      if (unit_cost_cents <= 0 && rawTotal != null && quantity > 0) {
        unit_cost_cents = Math.max(1, Math.round(rawTotal / quantity));
      } else {
        unit_cost_cents = coerceUnitCostCents({
          quantity,
          unit_cost_cents: rawUnit,
          line_total_cents: rawTotal,
        });
      }

      return {
        name,
        quantity,
        unit_cost_cents,
        line_total_cents: rawTotal ?? Math.round(unit_cost_cents * quantity),
        sku: item.sku?.trim() || null,
      };
    })
    .filter((item) => item.name.length > 0 && item.unit_cost_cents > 0);
}
