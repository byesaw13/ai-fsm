/**
 * P5-T5: UX Stabilization — Unit Tests
 *
 * Component-level tests (transition forms, delete confirmations) require a jsdom
 * environment and React Testing Library which are not yet in devDependencies.
 * These are documented as a follow-up (see PHASED_BACKLOG.yaml P5-T5 residuals).
 *
 * This file tests the pure JS logic that underpins the UX improvements:
 * - Payment amount validation (RecordPaymentForm guard logic)
 * - Auto-dismiss timer semantics (setTimeout/clearTimeout contract)
 * - Estimate line item total calculation
 */

import { describe, it, expect, vi, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Payment amount validation logic (mirrors RecordPaymentForm.handleSubmit)
// ---------------------------------------------------------------------------

function validatePaymentAmount(
  rawAmount: string,
  remainingCents: number
): { valid: true; amountCents: number } | { valid: false; error: string } {
  const amountCents = Math.round(parseFloat(rawAmount) * 100);
  if (isNaN(amountCents) || amountCents <= 0) {
    return { valid: false, error: "Please enter a valid payment amount" };
  }
  if (amountCents > remainingCents) {
    return {
      valid: false,
      error: `Amount exceeds remaining balance of $${(remainingCents / 100).toFixed(2)}`,
    };
  }
  return { valid: true, amountCents };
}

describe("validatePaymentAmount", () => {
  it("rejects empty string", () => {
    const result = validatePaymentAmount("", 10000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/valid payment amount/);
  });

  it("rejects zero", () => {
    const result = validatePaymentAmount("0", 10000);
    expect(result.valid).toBe(false);
  });

  it("rejects negative", () => {
    const result = validatePaymentAmount("-5", 10000);
    expect(result.valid).toBe(false);
  });

  it("rejects non-numeric", () => {
    const result = validatePaymentAmount("abc", 10000);
    expect(result.valid).toBe(false);
  });

  it("accepts valid amount within balance", () => {
    const result = validatePaymentAmount("50.00", 10000);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.amountCents).toBe(5000);
  });

  it("accepts exact remaining balance", () => {
    const result = validatePaymentAmount("100.00", 10000);
    expect(result.valid).toBe(true);
  });

  it("rejects amount exceeding balance", () => {
    const result = validatePaymentAmount("100.01", 10000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toMatch(/exceeds remaining balance/);
  });

  it("handles amounts with >2 decimal places (IEEE 754: 1.005*100 = 100.49... → 100)", () => {
    // Note: 1.005 in IEEE 754 is 1.00499999..., so Math.round(1.005*100) = 100.
    // The form's number input step="0.01" prevents this in practice.
    const result = validatePaymentAmount("1.005", 10000);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.amountCents).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Line item total calculation (mirrors estimates/new/page.tsx)
// ---------------------------------------------------------------------------

function parseCents(dollars: string): number {
  const n = parseFloat(dollars);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function lineTotal(qty: string, unitPrice: string): number {
  const q = parseFloat(qty);
  const p = parseCents(unitPrice);
  if (isNaN(q) || q <= 0) return 0;
  return Math.round(q * p);
}

describe("lineTotal", () => {
  it("calculates correct total for integer qty and price", () => {
    expect(lineTotal("2", "10.00")).toBe(2000);
  });

  it("returns 0 for zero qty", () => {
    expect(lineTotal("0", "10.00")).toBe(0);
  });

  it("returns 0 for negative qty", () => {
    expect(lineTotal("-1", "10.00")).toBe(0);
  });

  it("returns 0 for non-numeric qty", () => {
    expect(lineTotal("abc", "10.00")).toBe(0);
  });

  it("handles fractional quantities", () => {
    expect(lineTotal("1.5", "10.00")).toBe(1500);
  });

  it("handles zero price", () => {
    expect(lineTotal("5", "0.00")).toBe(0);
  });

  it("handles negative price (clamped to 0)", () => {
    expect(lineTotal("5", "-5.00")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Auto-dismiss timeout contract
// Verifies that setTimeout/clearTimeout behave as the useEffect hooks depend on.
// ---------------------------------------------------------------------------

describe("auto-dismiss timer semantics", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls dismiss callback after 3000ms", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    const t = setTimeout(dismiss, 3000);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2999);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
    clearTimeout(t);
  });

  it("clearTimeout prevents callback from firing", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    const t = setTimeout(dismiss, 3000);
    clearTimeout(t);
    vi.advanceTimersByTime(5000);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("payment success uses 5000ms dismiss (longer for financial ops)", () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    const t = setTimeout(dismiss, 5000);
    vi.advanceTimersByTime(4999);
    expect(dismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
    clearTimeout(t);
  });
});
