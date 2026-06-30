import { formatCents } from "@ai-fsm/money";

/**
 * Canonical deposit/final billing reconciliation.
 *
 * The Dovetails billing model (see migration 104_invoice_kind.sql) is:
 *
 *   - An estimate may have at most ONE deposit invoice (kind='deposit') and
 *     at most ONE final invoice (kind='final').
 *   - The deposit invoice bills `deposit_cents` up front.
 *   - The final invoice bills the FULL project total, but credits the deposit
 *     already billed via the invoice's `deposit_cents` field. The database
 *     computes `balance_cents = total_cents - deposit_cents` as a generated
 *     column, so the client's remaining balance excludes the deposit.
 *
 * Together the two invoices sum to exactly the estimate total — never more.
 * This module contains the pure arithmetic so it can be unit-tested without a
 * database. Negative line items are forbidden by a CHECK constraint, which is
 * why the deposit credit lives in the `deposit_cents` field rather than as a
 * negative line on the final invoice.
 */

export interface DepositInvoiceSummary {
  invoice_number: string;
  total_cents: number;
  /** Invoice status; voided deposits are excluded from the credit. */
  status: string;
}

export interface FinalInvoiceReconciliation {
  /** Full project total carried by the final invoice (estimate total). */
  invoiceTotalCents: number;
  /** Deposit already billed via non-void deposit invoice(s). Credited on the final invoice. */
  depositCreditCents: number;
  /** What the client still owes on the final invoice = total - deposit credit. */
  balanceDueCents: number;
  /** A human-readable note describing the reconciliation, or null if no deposit applies. */
  reconciliationNote: string | null;
}

/**
 * Compute how a final invoice should credit deposits already billed.
 *
 * - Only non-void deposit invoices count toward the credit (a voided deposit
 *   was never collectible, so it must not reduce the final balance).
 * - The credit is clamped to the invoice total so the balance can never go
 *   negative (e.g. an over-large deposit fully covers the job → balance 0).
 */
export function reconcileFinalInvoice(input: {
  invoiceTotalCents: number;
  depositInvoices: DepositInvoiceSummary[];
}): FinalInvoiceReconciliation {
  const { invoiceTotalCents, depositInvoices } = input;

  const liveDeposits = depositInvoices.filter((d) => d.status !== "void");
  const rawDepositCents = liveDeposits.reduce((sum, d) => sum + d.total_cents, 0);

  // Never credit more than the project total.
  const depositCreditCents = Math.min(Math.max(rawDepositCents, 0), Math.max(invoiceTotalCents, 0));
  const balanceDueCents = Math.max(0, invoiceTotalCents - depositCreditCents);

  let reconciliationNote: string | null = null;
  if (depositCreditCents > 0) {
    const refs = liveDeposits.map((d) => d.invoice_number).join(", ");
    reconciliationNote =
      `Project total ${formatCents(invoiceTotalCents)} less deposit already invoiced ` +
      `${formatCents(depositCreditCents)} (${refs}). Balance due ${formatCents(balanceDueCents)}.`;
  }

  return {
    invoiceTotalCents,
    depositCreditCents,
    balanceDueCents,
    reconciliationNote,
  };
}
