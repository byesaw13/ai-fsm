/**
 * Requested-deposit policy for a standard invoice.
 *
 * The deposit is a FIRST PAYMENT, not a credit: this computes how much to ask
 * for up front from the *current* total (so a percentage recomputes when a
 * change order edits the total). It never touches total_cents / paid_cents /
 * balance_cents — the amount owed stays the full total and collection is tracked
 * by paid_cents. Percentage is of the full total incl. tax (TASK-071 decision).
 */
export const INVOICE_DEPOSIT_TYPES = ["none", "percentage", "fixed"] as const;
export type InvoiceDepositType = (typeof INVOICE_DEPOSIT_TYPES)[number];

export interface InvoiceDepositPolicy {
  depositType: InvoiceDepositType;
  depositPercentage?: number | null;
  depositFixedCents?: number | null;
}

/** Amount to collect as the deposit, clamped to [0, total]. 0 = no deposit. */
export function requestedDepositCents(
  policy: InvoiceDepositPolicy,
  totalCents: number,
): number {
  const total = Math.max(0, Math.round(totalCents || 0));
  if (total === 0) return 0;

  if (policy.depositType === "percentage") {
    const pct = Math.min(100, Math.max(0, policy.depositPercentage ?? 0));
    return Math.min(total, Math.round(total * (pct / 100)));
  }
  if (policy.depositType === "fixed") {
    return Math.min(total, Math.max(0, Math.round(policy.depositFixedCents ?? 0)));
  }
  return 0;
}
