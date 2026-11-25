
/**
 * Pure payment math for invoices.
 *
 * A deposit is its own deposit invoice (TASK-257). On the final invoice,
 * `deposit_cents` is the credit for it: money already billed, which reduces
 * what this invoice may collect (`balance_cents = total - deposit`).
 *
 * Collectible remaining = total − deposit_credit − paid_on_this_invoice.
 */

/** Remaining amount collectible on this invoice (never negative). */
export function amountDueCents(
  totalCents: number,
  paidCents: number,
  depositCreditCents = 0,
): number {
  const credit = Math.max(0, depositCreditCents);
  return Math.max(0, totalCents - credit - paidCents);
}

/**
 * True when this invoice's obligation is fully covered by payments on this
 * invoice plus any deposit credit already applied.
 *
 * Zero-total invoices are never treated as paid here — callers should use
 * status === "paid" for those edge cases (avoids PAID stamp on empty drafts).
 *
 * `depositCreditCents` is the credit model field (`invoices.deposit_cents`):
 * money already billed on a separate deposit invoice.
 */
export function isInvoiceFullyPaid(
  totalCents: number,
  paidCents: number,
  depositCreditCents = 0,
): boolean {
  if (totalCents <= 0) return false;
  return paidCents + Math.max(0, depositCreditCents) >= totalCents;
}

/**
 * Validate that a payment amount is acceptable for the given invoice.
 * Returns null if valid, or an error message string.
 */
export function validatePaymentAmount(
  amountCents: number,
  invoiceTotalCents: number,
  currentPaidCents: number,
  depositCreditCents = 0,
): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return "Payment amount must be a positive integer (cents)";
  }
  const remaining = amountDueCents(
    invoiceTotalCents,
    currentPaidCents,
    depositCreditCents,
  );
  if (remaining <= 0) {
    return "Invoice is already fully paid";
  }
  if (amountCents > remaining) {
    return `Payment amount ($${(amountCents / 100).toFixed(2)}) exceeds remaining balance ($${(remaining / 100).toFixed(2)})`;
  }
  return null;
}
