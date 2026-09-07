/**
 * Progress (staged) billing for long jobs.
 *
 * Big jobs (the plan's A0b lane: jobs running longer than ~2 weeks) are billed
 * in stages — classically thirds: a deposit up front, one progress invoice at
 * the midpoint, and a final invoice at completion. Deposits already exist
 * (invoice_kind='deposit'); this module adds the middle stage.
 *
 * A progress invoice bills its own amount now (like a deposit) and the FINAL
 * invoice credits it via reconcileFinalInvoice — see lib/invoices/billing.ts —
 * so deposit + progress + final balance always sum to exactly the project
 * total, never more. Pure arithmetic here so it can be unit-tested without a DB.
 */

/** One third of the total, rounded to the nearest cent (the default stage size). */
export function thirdOfTotalCents(totalCents: number): number {
  return Math.max(0, Math.round(Math.max(0, Math.round(totalCents || 0)) / 3));
}

/**
 * Clamp a requested progress amount so staged invoices can never bill more than
 * the project total. The amount is bounded to [0, total - alreadyInvoiced],
 * where alreadyInvoiced is the sum of deposit + prior progress invoices already
 * billed (void invoices excluded by the caller).
 */
export function clampProgressAmountCents(input: {
  totalCents: number;
  alreadyInvoicedCents: number;
  requestedCents: number;
}): number {
  const total = Math.max(0, Math.round(input.totalCents || 0));
  const already = Math.max(0, Math.round(input.alreadyInvoicedCents || 0));
  const requested = Math.max(0, Math.round(input.requestedCents || 0));
  const remaining = Math.max(0, total - already);
  return Math.min(requested, remaining);
}
