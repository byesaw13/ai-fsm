import type { PoolClient } from "pg";
import { emitAttentionEvent } from "./emit";

/**
 * Emit invoice.paid or invoice.partial after payments update invoice status.
 * Used by manual Record Payment and Square webhook.
 */
export async function emitInvoicePaymentAttention(
  client: PoolClient,
  opts: {
    accountId: string;
    invoiceId: string;
    invoiceNumber?: string | null;
    status: string;
    paymentId?: string | null;
  },
): Promise<void> {
  if (opts.status !== "paid" && opts.status !== "partial") return;

  await emitAttentionEvent(client, {
    accountId: opts.accountId,
    type: opts.status === "paid" ? "invoice.paid" : "invoice.partial",
    entityType: "invoice",
    entityId: opts.invoiceId,
    title: opts.status === "paid" ? "Invoice paid" : "Partial payment",
    summary: opts.invoiceNumber ?? null,
    href: `/app/invoices/${opts.invoiceId}`,
    dedupeKey:
      opts.status === "paid"
        ? `invoice.paid:${opts.invoiceId}`
        : `invoice.partial:${opts.invoiceId}:${opts.paymentId ?? Date.now()}`,
  });
}
