import { describe, expect, it, vi, beforeEach } from "vitest";

const emitAttentionEvent = vi.fn();

vi.mock("../emit", () => ({
  emitAttentionEvent: (...args: unknown[]) => emitAttentionEvent(...args),
}));

import { emitInvoicePaymentAttention } from "../payment-emit";

describe("emitInvoicePaymentAttention", () => {
  const client = {} as never;

  beforeEach(() => {
    emitAttentionEvent.mockReset();
    emitAttentionEvent.mockResolvedValue("evt-1");
  });

  it("emits invoice.paid with stable dedupe key", async () => {
    await emitInvoicePaymentAttention(client, {
      accountId: "acc",
      invoiceId: "inv-1",
      invoiceNumber: "INV-100",
      status: "paid",
      paymentId: "pay-9",
    });
    expect(emitAttentionEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "invoice.paid",
        entityType: "invoice",
        entityId: "inv-1",
        title: "Invoice paid",
        summary: "INV-100",
        href: "/app/invoices/inv-1",
        dedupeKey: "invoice.paid:inv-1",
      }),
    );
  });

  it("emits invoice.partial with payment-scoped dedupe", async () => {
    await emitInvoicePaymentAttention(client, {
      accountId: "acc",
      invoiceId: "inv-1",
      status: "partial",
      paymentId: "pay-2",
    });
    expect(emitAttentionEvent).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        type: "invoice.partial",
        title: "Partial payment",
        dedupeKey: "invoice.partial:inv-1:pay-2",
      }),
    );
  });

  it("no-ops for non-payment statuses", async () => {
    await emitInvoicePaymentAttention(client, {
      accountId: "acc",
      invoiceId: "inv-1",
      status: "sent",
    });
    expect(emitAttentionEvent).not.toHaveBeenCalled();
  });
});
