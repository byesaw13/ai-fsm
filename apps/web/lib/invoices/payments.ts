import type { InvoiceStatus } from "@ai-fsm/domain";

/**
 * Derive the expected invoice status after a payment changes paid_cents.
 *
 * This is the pure-logic equivalent of the DB trigger `sync_invoice_on_payment`.
 * Used for unit tests and frontend optimistic display.
 */
export function deriveInvoiceStatus(
  totalCents: number,
  paidCents: number
): InvoiceStatus {
  if (paidCents >= totalCents) return "paid";
  if (paidCents > 0) return "partial";
  return "sent"; // fallback — should not happen after a payment
}

/**
 * Calculate the remaining amount due on an invoice.
 * Always returns >= 0 (overpayments clamp to 0).
 */
export function amountDueCents(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}

/**
 * Validate that a payment amount is acceptable for the given invoice.
 * Returns null if valid, or an error message string.
 */
export function validatePaymentAmount(
  amountCents: number,
  invoiceTotalCents: number,
  currentPaidCents: number
): string | null {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return "Payment amount must be a positive integer (cents)";
  }
  const remaining = invoiceTotalCents - currentPaidCents;
  if (remaining <= 0) {
    return "Invoice is already fully paid";
  }
  if (amountCents > remaining) {
    return `Payment amount ($${(amountCents / 100).toFixed(2)}) exceeds remaining balance ($${(remaining / 100).toFixed(2)})`;
  }
  return null;
}
