/** Billable qty step: quarter item (materials) or quarter hour (labor = 15 min). */
export const LINE_QUANTITY_STEP = 0.25;

/** Coerce pg numeric / string / null into a finite line quantity. */
export function parseLineQuantity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = parseFloat(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
}

/** Snap to nearest quarter (0.25, 0.5, 0.75, 1, …). Minimum billable increment is 0.25. */
export function snapLineQuantityToQuarter(value: unknown): number {
  const n = parseLineQuantity(value);
  const snapped = Math.round(n / LINE_QUANTITY_STEP) * LINE_QUANTITY_STEP;
  return Math.max(LINE_QUANTITY_STEP, snapped);
}

/** Value for <input type="number" defaultValue> — never blank, on quarter steps. */
export function formatLineQuantityInput(value: unknown): string {
  const n = snapLineQuantityToQuarter(value);
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(2)));
}

/** Human-readable qty for tables and PDFs. */
export function formatLineQuantityDisplay(value: unknown): string {
  const n = snapLineQuantityToQuarter(value);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}