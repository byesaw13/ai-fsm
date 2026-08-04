import { describe, it, expect } from "vitest";
import {
  deriveInvoiceStatus,
  amountDueCents,
  validatePaymentAmount,
  isInvoiceFullyPaid,
} from "../payments";

describe("deriveInvoiceStatus", () => {
  it("returns paid when paid equals total", () => {
    expect(deriveInvoiceStatus(10000, 10000)).toBe("paid");
  });

  it("returns paid when paid exceeds total", () => {
    expect(deriveInvoiceStatus(10000, 15000)).toBe("paid");
  });

  it("returns partial when paid is between 0 and total", () => {
    expect(deriveInvoiceStatus(10000, 5000)).toBe("partial");
  });

  it("returns partial for a one-cent payment", () => {
    expect(deriveInvoiceStatus(10000, 1)).toBe("partial");
  });

  it("returns sent when nothing paid and no deposit credit", () => {
    expect(deriveInvoiceStatus(10000, 0)).toBe("sent");
  });

  it("returns paid when deposit credit + payments cover total", () => {
    // Final invoice $15,526 with $1,500 deposit credit; client pays remaining $14,026
    expect(deriveInvoiceStatus(1_552_600, 1_402_600, 150_000)).toBe("paid");
  });

  it("returns partial when payments on final do not cover remainder after credit", () => {
    expect(deriveInvoiceStatus(1_552_600, 500_000, 150_000)).toBe("partial");
  });

  it("returns sent when only deposit credit applied (no payments on this invoice yet)", () => {
    // Credit reduces balance but does not mean this invoice has been paid
    expect(deriveInvoiceStatus(1_552_600, 0, 150_000)).toBe("sent");
  });

  it("returns paid when deposit credit alone covers the full total", () => {
    expect(deriveInvoiceStatus(150_000, 0, 150_000)).toBe("paid");
  });
});

describe("amountDueCents", () => {
  it("subtracts paid from total", () => {
    expect(amountDueCents(10000, 3000)).toBe(7000);
  });

  it("returns 0 when fully paid", () => {
    expect(amountDueCents(10000, 10000)).toBe(0);
  });

  it("clamps overpayment to 0", () => {
    expect(amountDueCents(10000, 15000)).toBe(0);
  });

  it("returns full total when nothing paid", () => {
    expect(amountDueCents(10000, 0)).toBe(10000);
  });

  it("handles odd cent amounts", () => {
    expect(amountDueCents(99, 50)).toBe(49);
  });

  it("subtracts deposit credit then payments", () => {
    expect(amountDueCents(1_552_600, 0, 150_000)).toBe(1_402_600);
    expect(amountDueCents(1_552_600, 400_000, 150_000)).toBe(1_002_600);
  });

  it("clamps when credit + paid exceed total", () => {
    expect(amountDueCents(100_000, 50_000, 60_000)).toBe(0);
  });

  it("treats negative credit as zero", () => {
    expect(amountDueCents(10000, 0, -500)).toBe(10000);
  });
});

describe("isInvoiceFullyPaid", () => {
  it("is false until credit + paid cover total", () => {
    expect(isInvoiceFullyPaid(10000, 0, 0)).toBe(false);
    expect(isInvoiceFullyPaid(10000, 5000, 0)).toBe(false);
    expect(isInvoiceFullyPaid(10000, 5000, 4000)).toBe(false);
    expect(isInvoiceFullyPaid(10000, 5000, 5000)).toBe(true);
    expect(isInvoiceFullyPaid(10000, 0, 10000)).toBe(true);
  });

  it("never treats zero-total invoices as paid", () => {
    expect(isInvoiceFullyPaid(0, 0, 0)).toBe(false);
    expect(isInvoiceFullyPaid(0, 0, 100)).toBe(false);
  });
});

describe("validatePaymentAmount", () => {
  it("accepts a valid partial payment", () => {
    expect(validatePaymentAmount(5000, 10000, 0)).toBeNull();
  });

  it("accepts payment that fills remaining balance", () => {
    expect(validatePaymentAmount(7000, 10000, 3000)).toBeNull();
  });

  it("rejects zero", () => {
    expect(validatePaymentAmount(0, 10000, 0)).toBeTruthy();
  });

  it("rejects negative", () => {
    expect(validatePaymentAmount(-100, 10000, 0)).toBeTruthy();
  });

  it("rejects non-integer cents", () => {
    expect(validatePaymentAmount(50.5, 10000, 0)).toBeTruthy();
  });

  it("rejects amount over remaining", () => {
    const result = validatePaymentAmount(8000, 10000, 5000);
    expect(result).toBeTruthy();
    expect(result).toContain("exceeds");
  });

  it("rejects payment on fully paid invoice", () => {
    const result = validatePaymentAmount(100, 10000, 10000);
    expect(result).toBeTruthy();
    expect(result).toContain("fully paid");
  });

  it("rejects payment on overpaid invoice", () => {
    const result = validatePaymentAmount(100, 10000, 12000);
    expect(result).toBeTruthy();
  });

  it("accepts exact full payment", () => {
    expect(validatePaymentAmount(10000, 10000, 0)).toBeNull();
  });

  it("accepts minimum one cent", () => {
    expect(validatePaymentAmount(1, 10000, 0)).toBeNull();
  });

  it("accepts large amounts within remaining", () => {
    expect(validatePaymentAmount(99999999, 100000000, 0)).toBeNull();
  });

  it("rejects one cent over remaining", () => {
    const result = validatePaymentAmount(5001, 10000, 5000);
    expect(result).toBeTruthy();
  });

  it("uses deposit credit when computing remaining", () => {
    // total 15526, deposit credit 1500 → remaining 14026; $15k payment is too much
    expect(validatePaymentAmount(1_500_000, 1_552_600, 0, 150_000)).toBeTruthy();
    expect(validatePaymentAmount(1_402_600, 1_552_600, 0, 150_000)).toBeNull();
  });

  it("rejects when deposit credit alone covers total", () => {
    expect(validatePaymentAmount(100, 150_000, 0, 150_000)).toContain("fully paid");
  });
});
