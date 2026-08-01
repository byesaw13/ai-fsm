/**
 * Receipt vision parse prompt + normalization.
 * Used by scan-receipt and parse-line-items.
 */

/** Default: Sonnet for precision. Override with RECEIPT_PARSE_MODEL (e.g. haiku for cost). */
export const DEFAULT_RECEIPT_PARSE_MODEL = "claude-sonnet-4-6";

export function getReceiptParseModel(): string {
  const fromEnv = process.env.RECEIPT_PARSE_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_RECEIPT_PARSE_MODEL;
}

export const RECEIPT_LINE_ITEMS_PROMPT = `You are a precise receipt OCR + line-item extractor for a residential handyman (Dovetails Services LLC).

Read the receipt IMAGE carefully. Prefer digits printed on the receipt over guesses.
Return ONLY valid JSON (no markdown fences):

{
  "vendor_name": "string or null — store name as printed (Home Depot, Lowe's, Ace, Benson Lumber, etc.)",
  "amount_cents": number or null — final amount charged in cents (include tax if tax is in the total paid),
  "expense_date": "YYYY-MM-DD or null",
  "category": "materials|tools|fuel|vehicle|meals|other|... or null",
  "notes": "string or null — short trip summary",
  "tax_cents": number or null — tax line in cents if shown,
  "po_number": "string or null — job / supply PO if written or printed (e.g. J260029, J-2026-0029, PO J260029). Do NOT invent.",
  "line_items": [
    {
      "name": "string — product description (prefer full description, not just SKU abbreviation)",
      "quantity": number — units purchased (default 1),
      "unit_cost_cents": number — PRICE PER ONE UNIT in cents, NEVER the line total,
      "line_total_cents": number — extended amount for the line in cents (qty × unit),
      "sku": "string or null — item/SKU/UPC as printed (digits/letters; not the price)"
    }
  ]
}

## Hard rules
1. Include every merchandise / material SKU row. Skip: tax, subtotal, total, payment tender, change, rewards, bag fee if not merchandise, blank lines.
2. quantity: from "N @", "N x", qty column, or repeated weight/LF. Do NOT collapse multi-qty into qty 1.
3. unit_cost_cents = net per-unit after line discounts. line_total_cents = what that row contributes.
4. CRITICAL: 3 @ $10.00 → quantity:3, unit_cost_cents:1000, line_total_cents:3000.
   WRONG: quantity:1, unit_cost_cents:3000.
5. Linear feet / lumber sold by LF: quantity = feet, unit_cost = price per foot.
6. SKU: copy the item number / UPC / Internet # when visible. Do not invent SKUs. Do not put prices in sku.
7. Prefer the most complete product description on the line (not only the short POS code if a longer description exists).
8. Sum of line_total_cents should be close to pre-tax merchandise total when tax is separate; if only a grand total is visible, still extract lines accurately.
9. category: materials for lumber, hardware, paint, fasteners, drywall, trim, etc.; tools for tools; fuel for gas.
10. po_number: only when a job/PO reference is clearly present (handwritten or printed). Prefer the short form when both appear (J260029). Never invent a PO.

## Store-specific hints
- Home Depot: often shows SKU, short name, qty @ unit, then line total. Internet SKU may appear.
- Lowe's: similar; item # and description; watch multi-qty.
- Ace / independent lumber: formats vary; still enforce unit vs line total.
- Ignore "YOU SAVED" marketing lines unless they adjust the paid unit price.

Be conservative: if a digit is unreadable, omit that field rather than inventing it.`;

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
  tax_cents?: number | null;
  /** Supply PO / job number if OCR found one (J260029, J-2026-0029, …). */
  po_number?: string | null;
  line_items?: ParsedReceiptLineItem[];
};

export type ReceiptParseReconciliation = {
  line_items_subtotal_cents: number;
  amount_cents: number | null;
  tax_cents: number | null;
  /** Absolute gap between sum(line totals) and amount (or amount - tax when tax known). */
  delta_cents: number | null;
  /** True when delta is within tolerance for a trustworthy parse. */
  balanced: boolean | null;
};

const CENTS_TOLERANCE = 2;
/** Allow a few dollars of slip for tax rounding / unread misc fees before flagging unbalanced. */
const BALANCE_TOLERANCE_CENTS = 150;

/**
 * Correct unit price when the model put the line total in unit_cost_cents.
 *
 * Classic bug: qty=3, unit=$30 (line total) instead of qty=3, unit=$10.
 * With line_total: if unit ≈ line_total and qty > 1, unit = line_total / qty.
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
    // HD swap: extended is unit, "unit" field is line total
    if (qty > 1 && Math.abs(total * qty - unit) <= CENTS_TOLERANCE) {
      return Math.max(1, total);
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

function cleanSku(sku: string | null | undefined): string | null {
  if (!sku) return null;
  const s = sku.trim();
  if (!s) return null;
  // Reject values that look like money
  if (/^\$?\d+\.\d{2}$/.test(s)) return null;
  if (/^\d{1,4}$/.test(s) && Number(s) < 100) return null; // tiny numbers often not SKUs
  return s.slice(0, 100);
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

      const line_total_cents = rawTotal ?? Math.round(unit_cost_cents * quantity);

      return {
        name,
        quantity,
        unit_cost_cents,
        line_total_cents,
        sku: cleanSku(item.sku),
      };
    })
    .filter((item) => item.name.length > 0 && item.unit_cost_cents > 0);
}

/** Sum line totals and compare to receipt total for a quality signal. */
export function reconcileReceiptParse(
  lineItems: ParsedReceiptLineItem[],
  amountCents: number | null | undefined,
  taxCents?: number | null,
): ReceiptParseReconciliation {
  const line_items_subtotal_cents = lineItems.reduce((sum, li) => {
    const line =
      typeof li.line_total_cents === "number" && li.line_total_cents > 0
        ? li.line_total_cents
        : Math.round(li.unit_cost_cents * (li.quantity > 0 ? li.quantity : 1));
    return sum + line;
  }, 0);

  const amount =
    typeof amountCents === "number" && amountCents > 0 ? Math.round(amountCents) : null;
  const tax =
    typeof taxCents === "number" && taxCents > 0 ? Math.round(taxCents) : null;

  if (amount == null) {
    return {
      line_items_subtotal_cents,
      amount_cents: null,
      tax_cents: tax,
      delta_cents: null,
      balanced: null,
    };
  }

  // Prefer comparing lines to pre-tax when tax known; else to grand total.
  const target = tax != null ? amount - tax : amount;
  const delta_cents = Math.abs(line_items_subtotal_cents - target);
  return {
    line_items_subtotal_cents,
    amount_cents: amount,
    tax_cents: tax,
    delta_cents,
    balanced: delta_cents <= BALANCE_TOLERANCE_CENTS,
  };
}
