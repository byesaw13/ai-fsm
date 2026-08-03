import type { InvoiceStatus } from "@ai-fsm/domain";

/**
 * Pure payment math for invoices.
 *
 * Two deposit models exist (see migration 154 + billing.ts):
 *
 * 1. **Credit model** (`deposit_cents` on a final/standard invoice): money
 *    already billed on a separate deposit invoice. Reduces what this invoice
 *    may collect. DB generated column: `balance_cents = total - deposit`.
 *
 * 2. **First-payment model** (`deposit_type` percentage/fixed): a requested
 *    first payment on the same invoice. Does not change total; tracked via
 *    `paid_cents` only. `deposit_cents` stays 0.
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
 */
export function isInvoiceFullyPaid(
  totalCents: number,
  paidCents: number,
  depositCreditCents = 0,
): boolean {
  if (totalCents <= 0) return paidCents >= 0;
  return paidCents + Math.max(0, depositCreditCents) >= totalCents;
}

/**
 * Derive the expected invoice status after a payment changes paid_cents.
 *
 * Pure-logic equivalent of the DB trigger `sync_invoice_on_payment`.
 * Deposit credit counts toward "fully paid" so a final invoice that credits
 * a $1,500 deposit is paid once the remaining balance is collected.
 */
export function deriveInvoiceStatus(
  totalCents: number,
  paidCents: number,
  depositCreditCents = 0,
): InvoiceStatus {
  if (isInvoiceFullyPaid(totalCents, paidCents, depositCreditCents)) return "paid";
  if (paidCents > 0) return "partial";
  return "sent"; // fallback — should not happen after a payment
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
