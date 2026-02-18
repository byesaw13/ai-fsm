export interface LineItemInput {
  description: string;
  quantity: number;
  unit_price_cents: number;
  sort_order?: number;
}

export interface Totals {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

/**
 * Get rounded total_cents for a single line item.
 * total_cents = round(quantity * unit_price_cents)
 */
export function lineItemTotal(item: LineItemInput): number {
  return Math.round(item.quantity * item.unit_price_cents);
}

/**
 * Calculate estimate totals from line items.
 * tax_cents = 0 (no tax rate feature in P3 scope).
 */
export function calcTotals(lineItems: LineItemInput[]): Totals {
  const subtotal_cents = lineItems.reduce(
    (sum, item) => sum + lineItemTotal(item),
    0
  );
  const tax_cents = 0;
  const total_cents = subtotal_cents + tax_cents;
  return { subtotal_cents, tax_cents, total_cents };
}
