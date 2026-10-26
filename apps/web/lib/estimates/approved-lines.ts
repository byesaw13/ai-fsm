/**
 * Which estimate lines become the final invoice (TASK-196).
 *
 * A multi-option estimate stores the chosen option's price on the option row.
 * The parent subtotal stays near zero (travel and risk only) because sent
 * totals cannot change. The invoice therefore takes its subtotal from the
 * lines this module drafts, plus snapshot travel added afterwards.
 * A standard estimate keeps the stored subtotal, tax and total. The drafted
 * lines are built so they add up to that stored subtotal.
 */

export interface ConvertSourceLine {
  id: string;
  option_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  adjustment_type: string | null;
  visible_to_customer: boolean;
}

export interface InvoiceDraftLine {
  estimate_line_item_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export interface InvoiceMoneyInput {
  presentation_mode: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  option: { subtotal_cents: number; tax_cents: number } | null;
  drafted_lines: { total_cents: number }[];
  /** Itemized snapshot travel inserted after the draft. Multi-option only. */
  snapshot_travel_cents?: number;
}

export interface InvoiceMoney {
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
}

/** Lines with no option, plus the selected option's lines. */
export function approvedLines<T extends { option_id: string | null }>(
  lines: T[],
  selectedOptionId: string | null,
): T[] {
  return lines.filter((line) => line.option_id == null || line.option_id === selectedOptionId);
}

function isStoredTravelLine(line: { adjustment_type: string | null; description: string }): boolean {
  return line.adjustment_type === "travel_surcharge"
    || line.description.includes("<!--travel-charge-->")
    || line.description.toLowerCase().includes("travel and service-area");
}

function nextSort(rows: { sort_order: number }[]): number {
  return rows.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
}

function adjustmentLine(description: string, cents: number, sortOrder: number): InvoiceDraftLine {
  return {
    estimate_line_item_id: null,
    description,
    quantity: 1,
    unit_price_cents: cents,
    total_cents: cents,
    sort_order: sortOrder,
  };
}

/**
 * Draft invoice lines from the approved estimate lines.
 * Hidden lines become one "Included work" line. Their own text is not copied.
 * A snapshot replaces stored travel lines, so those are omitted here.
 * Without a snapshot, a travel surcharge that is not already a line is added.
 */
export function invoiceLinesFor(
  estimate: {
    risk_adjustment_cents: number;
    travel_surcharge_cents: number;
    travel_snapshot_id: string | null;
  },
  lines: ConvertSourceLine[],
): InvoiceDraftLine[] {
  const source = estimate.travel_snapshot_id
    ? lines.filter((line) => !isStoredTravelLine(line))
    : lines;
  const visible = source.filter((line) => line.visible_to_customer !== false);
  const hidden = source.filter((line) => line.visible_to_customer === false);

  const drafted: InvoiceDraftLine[] = visible.map((line) => ({
    estimate_line_item_id: line.id,
    description: line.description,
    quantity: line.quantity,
    unit_price_cents: line.unit_price_cents,
    total_cents: line.total_cents,
    sort_order: line.sort_order,
  }));

  if (hidden.length > 0) {
    const total = hidden.reduce((sum, line) => sum + line.total_cents, 0);
    drafted.push(adjustmentLine("Included work", total, nextSort(drafted)));
  }
  if (estimate.risk_adjustment_cents > 0) {
    drafted.push(adjustmentLine("Risk adjustment", estimate.risk_adjustment_cents, nextSort(drafted)));
  }
  if (estimate.travel_surcharge_cents > 0 && estimate.travel_snapshot_id == null) {
    drafted.push(adjustmentLine("Travel", estimate.travel_surcharge_cents, nextSort(drafted)));
  }
  return drafted;
}

/** Standard invoices keep stored money. Multi-option invoices follow the drafted lines. */
export function invoiceMoneyFor(input: InvoiceMoneyInput): InvoiceMoney {
  if (input.presentation_mode !== "multi_option") {
    return {
      subtotal_cents: input.subtotal_cents,
      tax_cents: input.tax_cents,
      total_cents: input.total_cents,
    };
  }

  const subtotal = input.drafted_lines.reduce((sum, line) => sum + line.total_cents, 0)
    + (input.snapshot_travel_cents ?? 0);
  const option = input.option;
  let tax = 0;
  if (option && option.subtotal_cents > 0) {
    tax = subtotal === option.subtotal_cents
      ? option.tax_cents
      : Math.round((subtotal * option.tax_cents) / option.subtotal_cents);
  }
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax };
}
