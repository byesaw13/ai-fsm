import type { LineItemType } from "@ai-fsm/domain";

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
  unit_cost_cents?: number | null;
  line_item_type?: LineItemType | null;
}

export interface InvoiceDraftLine {
  estimate_line_item_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
  unit_cost_cents: number | null;
  line_item_type: LineItemType;
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
  /** Add-ons the customer chose when approving; their lines are in drafted_lines (TASK-225). */
  add_on_cents?: number;
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

/** The quote form's engine already saves these labels as lines. */
function describedAs(lines: { description: string }[], description: string): boolean {
  const wanted = description.toLowerCase();
  return lines.some((line) => line.description.trim().toLowerCase() === wanted);
}

function adjustmentLine(description: string, cents: number, sortOrder: number): InvoiceDraftLine {
  return {
    estimate_line_item_id: null,
    description,
    quantity: 1,
    unit_price_cents: cents,
    total_cents: cents,
    sort_order: sortOrder,
    unit_cost_cents: null,
    line_item_type: "adjustment",
  };
}

/**
 * Draft invoice lines from the approved estimate lines.
 * Hidden lines become one "Included work" line. Their own text is not copied.
 * A snapshot replaces stored travel lines, so those are omitted here.
 * Without a snapshot, a travel surcharge that is not already a line is added.
 * The quote form's engine already writes "Risk adjustment" and "Travel surcharge"
 * lines, and also leaves the surcharge fields set. Those fields are not added again.
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
    unit_cost_cents: line.unit_cost_cents ?? null,
    line_item_type: line.line_item_type ?? "labor",
  }));

  if (hidden.length > 0) {
    const total = hidden.reduce((sum, line) => sum + line.total_cents, 0);
    drafted.push(adjustmentLine("Included work", total, nextSort(drafted)));
  }
  if (estimate.risk_adjustment_cents > 0 && !describedAs(source, "Risk adjustment")) {
    drafted.push(adjustmentLine("Risk adjustment", estimate.risk_adjustment_cents, nextSort(drafted)));
  }
  if (
    estimate.travel_surcharge_cents > 0
    && estimate.travel_snapshot_id == null
    && !describedAs(source, "Travel surcharge")
  ) {
    drafted.push(adjustmentLine("Travel", estimate.travel_surcharge_cents, nextSort(drafted)));
  }
  return drafted;
}

/** An add-on amount's tax at the quote's own rate (TASK-225). */
function addOnTaxCents(addOnCents: number, quote: { subtotal_cents: number; tax_cents: number }): number {
  return quote.subtotal_cents > 0 ? Math.round((addOnCents * quote.tax_cents) / quote.subtotal_cents) : 0;
}

/**
 * What the customer approves with add-ons: the quote total plus the add-ons
 * and their tax. The portal, the deposit and both bill paths use this, so the
 * approved amount is the billed amount (TASK-225).
 */
export function totalWithAddOns(
  quote: { subtotal_cents: number; tax_cents: number; total_cents: number },
  addOnCents: number,
): number {
  return quote.total_cents + addOnCents + addOnTaxCents(addOnCents, quote);
}

/** Add-ons as work items, so the crew's work order lists them (TASK-225). */
export function addOnWorkLines(addOns: { label: string; price_cents: number }[]) {
  return addOns.map((a) => ({
    description: `${a.label} (added option)`,
    line_item_type: "labor",
    quantity: 1,
    unit_price_cents: a.price_cents,
    total_cents: a.price_cents,
  }));
}

/** One bill line per add-on the customer chose when approving (TASK-225). */
export function addOnLines(
  addOns: { label: string; price_cents: number }[],
  drafted: { sort_order: number }[],
): InvoiceDraftLine[] {
  const start = nextSort(drafted);
  return addOns.map((a, i) => ({
    estimate_line_item_id: null,
    description: `${a.label} (added option)`,
    quantity: 1,
    unit_price_cents: a.price_cents,
    total_cents: a.price_cents,
    sort_order: start + i,
    unit_cost_cents: null,
    line_item_type: "labor" as const,
  }));
}

/**
 * Standard invoices keep stored money when the drafted lines already equal
 * that subtotal. When the lines already include engine adjustments, their sum
 * is the approved total and becomes the invoice subtotal. Multi-option
 * invoices follow the drafted lines.
 */
export function invoiceMoneyFor(input: InvoiceMoneyInput): InvoiceMoney {
  const draftedSum = input.drafted_lines.reduce((sum, line) => sum + line.total_cents, 0);
  const addOn = input.add_on_cents ?? 0;
  if (input.presentation_mode !== "multi_option" && addOn > 0) {
    // The quote's stored money plus the chosen add-ons, taxed at the quote's rate.
    return {
      subtotal_cents: input.subtotal_cents + addOn,
      tax_cents: input.tax_cents + addOnTaxCents(addOn, input),
      total_cents: totalWithAddOns(input, addOn),
    };
  }
  if (input.presentation_mode !== "multi_option") {
    if (draftedSum === input.subtotal_cents) {
      return {
        subtotal_cents: input.subtotal_cents,
        tax_cents: input.tax_cents,
        total_cents: input.total_cents,
      };
    }
    if (draftedSum === input.total_cents) {
      return { subtotal_cents: draftedSum, tax_cents: 0, total_cents: draftedSum };
    }
    return {
      subtotal_cents: input.subtotal_cents,
      tax_cents: input.tax_cents,
      total_cents: input.total_cents,
    };
  }

  const subtotal = draftedSum + (input.snapshot_travel_cents ?? 0);
  const option = input.option;
  let tax = 0;
  if (option && option.subtotal_cents > 0) {
    tax = subtotal === option.subtotal_cents
      ? option.tax_cents
      : Math.round((subtotal * option.tax_cents) / option.subtotal_cents);
  }
  return { subtotal_cents: subtotal, tax_cents: tax, total_cents: subtotal + tax };
}
