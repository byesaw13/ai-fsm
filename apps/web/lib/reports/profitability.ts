/**
 * Profitability report helpers.
 *
 * Pure functions for math and formatting — no DB access.
 * Used by the reporting API and UI pages.
 */

// ============================================================================
// Money helpers
// ============================================================================

/**
 * Format cents as a USD dollar string (e.g. 12345 → "$123.45").
 * Handles negative values: -500 → "-$5.00"
 */
export function formatCents(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Net revenue: paid invoice revenue minus total expenses.
 * Returns cents (integer). Mileage is informational only — not subtracted.
 */
export function netRevenueCents(paidRevenueCents: number, expensesCents: number): number {
  return paidRevenueCents - expensesCents;
}

/**
 * Job-level profitability for a single job.
 * Returns net_cents = revenue_cents - expense_cents.
 * Mileage is informational.
 */
export function jobNetCents(revenueCents: number, expenseCents: number): number {
  return revenueCents - expenseCents;
}

/**
 * Completeness status for a job profitability row.
 * A job has "complete" profitability data only if it has at least one linked invoice.
 */
export function jobProfitabilityStatus(invoiceCount: number): "complete" | "partial" {
  return invoiceCount > 0 ? "complete" : "partial";
}

// ============================================================================
// Month helpers
// ============================================================================

/**
 * Returns current month in YYYY-MM format (UTC-safe).
 */
export function currentMonthYYYYMM(): string {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Validate a month string (YYYY-MM format).
 */
export function isValidMonth(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

/**
 * Resolve the target month: use provided if valid, else fall back to current month.
 */
export function resolveMonth(month: string | null | undefined): string {
  if (month && isValidMonth(month)) return month;
  return currentMonthYYYYMM();
}

// ============================================================================
// Aggregation helpers
// ============================================================================

/**
 * Sum an array of cent values.
 */
export function sumCents(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0);
}

/**
 * Compute outstanding AR: total invoice amount minus paid for non-terminal statuses.
 * Terminal statuses: "paid" and "void".
 */
export function outstandingCents(
  rows: Array<{ status: string; total_cents: number; paid_cents: number }>
): number {
  return rows
    .filter((r) => !["paid", "void"].includes(r.status))
    .reduce((sum, r) => sum + (r.total_cents - r.paid_cents), 0);
}
