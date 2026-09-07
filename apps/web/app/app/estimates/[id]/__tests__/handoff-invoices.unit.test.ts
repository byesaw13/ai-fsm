import { describe, expect, it } from "vitest";
import { selectActiveHandoffInvoices, type HandoffInvoice } from "../handoff-invoices";

function row(over: Partial<HandoffInvoice> & Pick<HandoffInvoice, "id" | "invoice_kind">): HandoffInvoice {
  return {
    invoice_number: "INV-1",
    status: "sent",
    total_cents: 10000,
    balance_cents: 10000,
    ...over,
  };
}

describe("selectActiveHandoffInvoices", () => {
  it("ignores void deposits so a replacement can be collected", () => {
    const { depositInvoice } = selectActiveHandoffInvoices([
      row({ id: "voided", invoice_kind: "deposit", status: "void" }),
    ]);
    expect(depositInvoice).toBeNull();
  });

  it("picks the live deposit over a voided one", () => {
    const { depositInvoice } = selectActiveHandoffInvoices([
      row({ id: "live", invoice_kind: "deposit", status: "draft" }),
      row({ id: "voided", invoice_kind: "deposit", status: "void" }),
    ]);
    expect(depositInvoice?.id).toBe("live");
  });

  it("ignores void finals", () => {
    const { finalInvoice } = selectActiveHandoffInvoices([
      row({ id: "void-final", invoice_kind: "final", status: "void" }),
    ]);
    expect(finalInvoice).toBeNull();
  });
});
