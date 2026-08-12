/**
 * Owner hard-delete policy for invoices.
 * Drafts and unpaid (including void) may be removed for wrong/test data.
 * Anything with payments must be voided / refunded through the payment path.
 */
export function canOwnerHardDeleteInvoice(inv: {
  status: string;
  paid_cents: number;
}): boolean {
  if (inv.paid_cents > 0) return false;
  if (inv.status === "paid" || inv.status === "partial") return false;
  return true;
}

export function ownerHardDeleteInvoiceBlockReason(inv: {
  status: string;
  paid_cents: number;
}): string | null {
  if (canOwnerHardDeleteInvoice(inv)) return null;
  if (inv.paid_cents > 0 || inv.status === "paid" || inv.status === "partial") {
    return `Invoices with payments cannot be deleted (status: ${inv.status}, paid: ${inv.paid_cents}¢). Void or reverse payments first.`;
  }
  return `Invoice cannot be deleted (status: ${inv.status}).`;
}
