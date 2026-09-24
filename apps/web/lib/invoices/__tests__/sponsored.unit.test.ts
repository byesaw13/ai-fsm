import { describe, expect, it } from "vitest";
import { formatSponsoredInvoiceLabel } from "../sponsored";

describe("formatSponsoredInvoiceLabel", () => {
  it("uses the first work-summary line or invoice number", () => {
    expect(formatSponsoredInvoiceLabel({
      propertyAddress: "469 Cilley Road",
      beneficiaryName: "Client not yet identified",
      workSummary: "Refresh before listing\n• Paint touch-ups",
      invoiceNumber: "0203",
    })).toBe("469 Cilley Road — Client not yet identified — Refresh before listing");

    expect(formatSponsoredInvoiceLabel({
      propertyAddress: "96 Richardson Road",
      beneficiaryName: "Emma",
      workSummary: null,
      invoiceNumber: "0200",
    })).toBe("96 Richardson Road — Emma — Invoice 0200");
  });

  it("omits the beneficiary when none is recorded (TASK-159)", () => {
    expect(formatSponsoredInvoiceLabel({
      propertyAddress: "16 E Chamberlain",
      beneficiaryName: null,
      workSummary: "Light fixture replacement",
      invoiceNumber: "INV-0022",
    })).toBe("16 E Chamberlain — Light fixture replacement");
  });
});
