/**
 * The deposit gate on an approved job (TASK-120). A deposit is always its own
 * deposit invoice, credited on the final invoice (TASK-257).
 */
import { clampProgressAmountCents } from "./progress";
import { percentOfCents } from "@/lib/estimates/deposit-policy";

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
  return Math.min(total, percentOfCents(total, input.depositPercent || 0));
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
