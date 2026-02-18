import { describe, it, expect } from "vitest";
import {
  deriveInvoiceStatus,
  amountDueCents,
  validatePaymentAmount,
} from "../payments";

describe("deriveInvoiceStatus", () => {
  it("returns 'paid' when paid >= total", () => {
    expect(deriveInvoiceStatus(10000, 10000)).toBe("paid");
  });

  it("returns 'paid' when overpaid", () => {
    expect(deriveInvoiceStatus(10000, 15000)).toBe("paid");
  });

  it("returns 'partial' when 0 < paid < total", () => {
    expect(deriveInvoiceStatus(10000, 5000)).toBe("partial");
  });

  it("returns 'partial' when paid is 1 cent", () => {
    expect(deriveInvoiceStatus(10000, 1)).toBe("partial");
  });

  it("returns 'sent' when paid is 0", () => {
    expect(deriveInvoiceStatus(10000, 0)).toBe("sent");
  });
});

describe("amountDueCents", () => {
  it("calculates remaining balance", () => {
    expect(amountDueCents(10000, 3000)).toBe(7000);
  });

  it("returns 0 when fully paid", () => {
    expect(amountDueCents(10000, 10000)).toBe(0);
  });

  it("returns 0 when overpaid", () => {
    expect(amountDueCents(10000, 15000)).toBe(0);
  });

  it("returns full total when nothing paid", () => {
    expect(amountDueCents(10000, 0)).toBe(10000);
  });

  it("handles small amounts correctly (cents precision)", () => {
    expect(amountDueCents(99, 50)).toBe(49);
  });
});

describe("validatePaymentAmount", () => {
  it("returns null for valid payment", () => {
    expect(validatePaymentAmount(5000, 10000, 0)).toBeNull();
  });

  it("returns null for exact remaining amount", () => {
    expect(validatePaymentAmount(7000, 10000, 3000)).toBeNull();
  });

  it("rejects zero amount", () => {
    expect(validatePaymentAmount(0, 10000, 0)).toBeTruthy();
  });

  it("rejects negative amount", () => {
    expect(validatePaymentAmount(-100, 10000, 0)).toBeTruthy();
  });

  it("rejects non-integer amount", () => {
    expect(validatePaymentAmount(50.5, 10000, 0)).toBeTruthy();
  });

  it("rejects amount exceeding remaining balance", () => {
    const result = validatePaymentAmount(8000, 10000, 5000);
    expect(result).toBeTruthy();
    expect(result).toContain("exceeds");
  });

  it("rejects payment when invoice is fully paid", () => {
    const result = validatePaymentAmount(100, 10000, 10000);
    expect(result).toBeTruthy();
    expect(result).toContain("fully paid");
  });

  it("rejects payment when overpaid", () => {
    const result = validatePaymentAmount(100, 10000, 12000);
    expect(result).toBeTruthy();
    expect(result).toContain("fully paid");
  });

  it("accepts exact payment to fully pay invoice", () => {
    expect(validatePaymentAmount(10000, 10000, 0)).toBeNull();
  });

  it("accepts 1 cent payment", () => {
    expect(validatePaymentAmount(1, 10000, 0)).toBeNull();
  });

  // Edge cases for cents-only arithmetic
  it("handles large cent values correctly", () => {
    expect(validatePaymentAmount(99999999, 100000000, 0)).toBeNull();
  });

  it("rejects exceeding by 1 cent", () => {
    const result = validatePaymentAmount(5001, 10000, 5000);
    expect(result).toBeTruthy();
    expect(result).toContain("exceeds");
  });
});
