/**
 * Requested-deposit policy for a standard invoice.
 *
 * The deposit is a FIRST PAYMENT, not a credit: this computes how much to ask
 * for up front from the *current* total (so a percentage recomputes when a
 * change order edits the total). It never touches total_cents / paid_cents /
 * balance_cents — the amount owed stays the full total and collection is tracked
 * by paid_cents. Percentage is of the full total incl. tax (TASK-071 decision).
 */
import { clampProgressAmountCents } from "./progress";

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

/**
 * Default deposit for the "collect a deposit" action on an approved job
 * (TASK-120 deposit gate): the estimate's configured `deposit_cents` when the
 * owner set one, otherwise the company standard deposit % of the project total
 * (Settings → Company "Standard deposit (%)"). Clamped to [0, total].
 */
export function defaultDepositCents(input: {
  estimateTotalCents: number;
  configuredDepositCents?: number | null;
  depositPercent: number;
}): number {
  const total = Math.max(0, Math.round(input.estimateTotalCents || 0));
  if (total === 0) return 0;
  const configured = Math.max(0, Math.round(input.configuredDepositCents ?? 0));
  if (configured > 0) return Math.min(total, configured);
  const pct = Math.min(100, Math.max(0, input.depositPercent || 0));
  return Math.min(total, Math.round(total * (pct / 100)));
}

/**
 * Deposit amount for the collect-deposit gate, never exceeding what is still
 * uninvoiced (progress invoices already billed count against the remaining
 * balance — same clamp as progress-invoice).
 */
export function gatedDepositCents(input: {
  estimateTotalCents: number;
  configuredDepositCents?: number | null;
  depositPercent: number;
  alreadyInvoicedCents: number;
}): number {
  return clampProgressAmountCents({
    totalCents: input.estimateTotalCents,
    alreadyInvoicedCents: input.alreadyInvoicedCents,
    requestedCents: defaultDepositCents(input),
  });
}
