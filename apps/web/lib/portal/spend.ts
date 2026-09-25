export interface SpendInvoice {
  status: string;
  paid_cents: number;
  deposit_cents: number | null;
  paid_at: string | null;
  sent_at: string | null;
}

/** Money received on one invoice: payments + deposit credit (mig 193); drafts/voids count nothing. */
export function receivedCents(inv: Pick<SpendInvoice, "status" | "paid_cents" | "deposit_cents">): number {
  if (inv.status === "draft" || inv.status === "void") return 0;
  return Number(inv.paid_cents ?? 0) + Math.max(Number(inv.deposit_cents ?? 0), 0);
}

/**
 * Lifetime and this-year money received from a client (TASK-161). Uses the
 * same paid math as migration 193 (payments + deposit credit), skips drafts
 * and voids, and dates a payment by paid_at, falling back to sent_at.
 */
export function summarizeSpend(invoices: SpendInvoice[], now = new Date()): { allTimeCents: number; thisYearCents: number } {
  const year = now.getFullYear();
  let allTimeCents = 0;
  let thisYearCents = 0;
  for (const inv of invoices) {
    const received = receivedCents(inv);
    if (received <= 0) continue;
    allTimeCents += received;
    const when = inv.paid_at ?? inv.sent_at;
    if (when && new Date(when).getFullYear() === year) thisYearCents += received;
  }
  return { allTimeCents, thisYearCents };
}
