import { describe, it, expect } from "vitest";
import { estimateTransitions } from "@ai-fsm/domain";
import { calcTotals, lineItemTotal } from "../math";
import {
  canCreateEstimates,
  canSendEstimates,
  canDeleteRecords,
} from "../../auth/permissions";

// ===
// Estimate lifecycle transition map coverage
// ===

describe("estimateTransitions", () => {
  it("draft → sent is the only allowed first transition", () => {
    const allowed = estimateTransitions["draft"];
    expect(allowed).toContain("sent");
    expect(allowed).toHaveLength(1);
  });

  it("sent → approved is allowed", () => {
    expect(estimateTransitions["sent"]).toContain("approved");
  });

  it("sent → declined is allowed", () => {
    expect(estimateTransitions["sent"]).toContain("declined");
  });

  it("sent → expired is allowed", () => {
    expect(estimateTransitions["sent"]).toContain("expired");
  });

  it("sent has exactly 3 allowed transitions", () => {
    expect(estimateTransitions["sent"]).toHaveLength(3);
  });

  it("approved is a terminal state (no transitions)", () => {
    expect(estimateTransitions["approved"]).toHaveLength(0);
  });

  it("declined is a terminal state (no transitions)", () => {
    expect(estimateTransitions["declined"]).toHaveLength(0);
  });

  it("expired is a terminal state (no transitions)", () => {
    expect(estimateTransitions["expired"]).toHaveLength(0);
  });

  it("draft → approved is not allowed (must go through sent)", () => {
    expect(estimateTransitions["draft"]).not.toContain("approved");
  });

  it("draft → declined is not allowed", () => {
    expect(estimateTransitions["draft"]).not.toContain("declined");
  });

  it("draft → expired is not allowed", () => {
    expect(estimateTransitions["draft"]).not.toContain("expired");
  });

  it("all 5 statuses are present as keys", () => {
    const keys = Object.keys(estimateTransitions);
    expect(keys).toContain("draft");
    expect(keys).toContain("sent");
    expect(keys).toContain("approved");
    expect(keys).toContain("declined");
    expect(keys).toContain("expired");
    expect(keys).toHaveLength(5);
  });
});

// ===
// calcTotals and lineItemTotal
// ===

describe("calcTotals", () => {
  it("sums line item totals into subtotal_cents", () => {
    const items = [
      { description: "Service A", quantity: 2, unit_price_cents: 5000 },
      { description: "Service B", quantity: 1, unit_price_cents: 3000 },
    ];
    const result = calcTotals(items);
    expect(result.subtotal_cents).toBe(13000); // 2*5000 + 1*3000
  });

  it("tax_cents is 0 (P3 scope, no tax rate)", () => {
    const items = [{ description: "Test", quantity: 1, unit_price_cents: 1000 }];
    const result = calcTotals(items);
    expect(result.tax_cents).toBe(0);
  });

  it("total_cents equals subtotal_cents when tax is 0", () => {
    const items = [{ description: "Test", quantity: 3, unit_price_cents: 1000 }];
    const result = calcTotals(items);
    expect(result.total_cents).toBe(result.subtotal_cents);
    expect(result.total_cents).toBe(3000);
  });

  it("returns zero totals for empty line items", () => {
    const result = calcTotals([]);
    expect(result.subtotal_cents).toBe(0);
    expect(result.tax_cents).toBe(0);
    expect(result.total_cents).toBe(0);
  });

  it("rounds fractional quantities correctly", () => {
    // 1.5 items * 1000 cents = 1500
    const items = [
      { description: "Partial", quantity: 1.5, unit_price_cents: 1000 },
    ];
    const result = calcTotals(items);
    expect(result.subtotal_cents).toBe(1500);
  });

  it("handles large values", () => {
    const items = [
      { description: "Big job", quantity: 100, unit_price_cents: 100000 },
    ];
    const result = calcTotals(items);
    expect(result.subtotal_cents).toBe(10_000_000);
  });
});

describe("lineItemTotal", () => {
  it("computes quantity * unit_price_cents", () => {
    expect(
      lineItemTotal({ description: "x", quantity: 2, unit_price_cents: 5000 })
    ).toBe(10000);
  });

  it("rounds result to nearest cent", () => {
    // 1.1 * 1 cent = 1.1 → rounds to 1
    expect(
      lineItemTotal({ description: "x", quantity: 1.1, unit_price_cents: 1 })
    ).toBe(1);
  });
});

// ===
// Role-based permission checks for estimates
// ===

describe("estimate permissions", () => {
  it("canCreateEstimates: owner and admin only", () => {
    expect(canCreateEstimates("owner")).toBe(true);
    expect(canCreateEstimates("admin")).toBe(true);
    expect(canCreateEstimates("tech")).toBe(false);
  });

  it("canSendEstimates: owner and admin only", () => {
    expect(canSendEstimates("owner")).toBe(true);
    expect(canSendEstimates("admin")).toBe(true);
    expect(canSendEstimates("tech")).toBe(false);
  });

  it("canDeleteRecords: owner only", () => {
    expect(canDeleteRecords("owner")).toBe(true);
    expect(canDeleteRecords("admin")).toBe(false);
    expect(canDeleteRecords("tech")).toBe(false);
  });
});
