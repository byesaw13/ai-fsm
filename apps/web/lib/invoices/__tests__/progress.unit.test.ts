import { describe, it, expect } from "vitest";
import { thirdOfTotalCents, clampProgressAmountCents } from "../progress";

describe("thirdOfTotalCents", () => {
  it("rounds to the nearest cent", () => {
    expect(thirdOfTotalCents(300_00)).toBe(100_00);
    expect(thirdOfTotalCents(100_00)).toBe(33_33); // 10000/3 = 3333.33 → 3333
  });

  it("never goes negative", () => {
    expect(thirdOfTotalCents(0)).toBe(0);
    expect(thirdOfTotalCents(-500)).toBe(0);
  });
});

describe("clampProgressAmountCents", () => {
  it("returns the requested amount when it fits within the remaining balance", () => {
    expect(
      clampProgressAmountCents({ totalCents: 300_00, alreadyInvoicedCents: 100_00, requestedCents: 100_00 }),
    ).toBe(100_00);
  });

  it("clamps to the remaining balance so staged invoices never exceed the total", () => {
    // deposit already billed 100_00; only 200_00 remains — a 250_00 request clamps.
    expect(
      clampProgressAmountCents({ totalCents: 300_00, alreadyInvoicedCents: 100_00, requestedCents: 250_00 }),
    ).toBe(200_00);
  });

  it("returns 0 when the total is already fully invoiced", () => {
    expect(
      clampProgressAmountCents({ totalCents: 300_00, alreadyInvoicedCents: 300_00, requestedCents: 100_00 }),
    ).toBe(0);
  });

  it("never returns a negative amount", () => {
    expect(
      clampProgressAmountCents({ totalCents: 100_00, alreadyInvoicedCents: 500_00, requestedCents: 50_00 }),
    ).toBe(0);
    expect(
      clampProgressAmountCents({ totalCents: 100_00, alreadyInvoicedCents: 0, requestedCents: -50_00 }),
    ).toBe(0);
  });
});
