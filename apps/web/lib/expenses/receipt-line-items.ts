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
      "quantity": number — default 1,
      "unit_cost_cents": number — price paid per unit in cents (integer),
      "sku": "string or null"
    }
  ]
}

Rules:
- Include every billable SKU row; skip tax lines, subtotal rows, and payment tender lines.
- unit_cost_cents is the net unit price actually paid (after line discounts).
- line_items amounts should sum close to amount_cents when possible.
- materials category for lumber, hardware, paint, fasteners, trim, etc.`;

export type ParsedReceiptLineItem = {
  name: string;
  quantity: number;
  unit_cost_cents: number;
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

export function normalizeParsedReceiptLineItems(
  raw: ParsedReceiptLineItem[] | undefined,
): ParsedReceiptLineItem[] {
  if (!raw?.length) return [];
  return raw
    .map((item) => ({
      name: item.name?.trim() ?? "",
      quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1,
      unit_cost_cents:
        typeof item.unit_cost_cents === "number" && item.unit_cost_cents > 0
          ? Math.round(item.unit_cost_cents)
          : 0,
      sku: item.sku?.trim() || null,
    }))
    .filter((item) => item.name.length > 0 && item.unit_cost_cents > 0);
}