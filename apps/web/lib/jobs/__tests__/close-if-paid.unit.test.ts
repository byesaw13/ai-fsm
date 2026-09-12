import { describe, expect, it } from "vitest";
import { shouldCloseJobFromInvoices } from "../close-if-paid";

describe("shouldCloseJobFromInvoices", () => {
  it("closes when the standard invoice is paid and nothing is open", () => {
    expect(
      shouldCloseJobFromInvoices([{ invoice_kind: "standard", status: "paid" }]),
    ).toBe(true);
  });

  it("does not close on a paid deposit only", () => {
    expect(
      shouldCloseJobFromInvoices([{ invoice_kind: "deposit", status: "paid" }]),
    ).toBe(false);
  });

  it("does not close while a deposit sibling is still open", () => {
    expect(
      shouldCloseJobFromInvoices([
        { invoice_kind: "final", status: "paid" },
        { invoice_kind: "deposit", status: "sent" },
      ]),
    ).toBe(false);
  });

  it("does not close while a standard invoice is still sent", () => {
    expect(
      shouldCloseJobFromInvoices([
        { invoice_kind: "standard", status: "paid" },
        { invoice_kind: "standard", status: "sent" },
      ]),
    ).toBe(false);
  });

  it("ignores void invoices", () => {
    expect(
      shouldCloseJobFromInvoices([
        { invoice_kind: "standard", status: "void" },
        { invoice_kind: "final", status: "paid" },
      ]),
    ).toBe(true);
  });
});
