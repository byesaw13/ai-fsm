import { describe, expect, it } from "vitest";
import {
  materialHandlingCents,
  materialInvoiceTotalCents,
  materialExpenseDescription,
} from "../material-handling";

describe("job-expenses", () => {
  it("bills materials at cost plus 15% handling (estimate contract)", () => {
    expect(materialHandlingCents(2872)).toBe(431);
    expect(materialInvoiceTotalCents(2872)).toBe(3303);
    expect(materialHandlingCents(35372)).toBe(5306);
  });

  it("prefers expense notes for invoice line description", () => {
    expect(
      materialExpenseDescription({
        id: "e1",
        vendor_name: "Home Depot",
        amount_cents: 1000,
        notes: "PVC trim and siding",
      }),
    ).toBe("PVC trim and siding");
  });
});