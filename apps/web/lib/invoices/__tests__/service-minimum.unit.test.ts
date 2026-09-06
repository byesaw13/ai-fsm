import { describe, it, expect } from "vitest";
import { planServiceMinimum, isServiceMinimumEligible } from "../service-minimum";

const MIN = 185_00;

describe("planServiceMinimum", () => {
  it("creates a top-up line when the subtotal is below the minimum and none exists", () => {
    // $57.50 labor only → needs $127.50
    expect(planServiceMinimum([{ total_cents: 57_50, is_service_minimum: false }], MIN)).toEqual({
      action: "create",
      amountCents: 127_50,
    });
  });

  it("sums the WHOLE subtotal (labor + materials), not labor alone", () => {
    // $57.50 labor + $100 materials = $157.50 → needs $27.50
    expect(
      planServiceMinimum(
        [
          { total_cents: 57_50, is_service_minimum: false },
          { total_cents: 100_00, is_service_minimum: false },
        ],
        MIN,
      ),
    ).toEqual({ action: "create", amountCents: 27_50 });
  });

  it("excludes the existing minimum line from the base, then updates it", () => {
    // base is the $57.50 labor only; the stale $130 min line is ignored → update to $127.50
    expect(
      planServiceMinimum(
        [
          { total_cents: 57_50, is_service_minimum: false },
          { total_cents: 130_00, is_service_minimum: true },
        ],
        MIN,
      ),
    ).toEqual({ action: "update", amountCents: 127_50 });
  });

  it("removes an existing minimum line once the real subtotal reaches the minimum", () => {
    expect(
      planServiceMinimum(
        [
          { total_cents: 345_00, is_service_minimum: false },
          { total_cents: 50_00, is_service_minimum: true },
        ],
        MIN,
      ),
    ).toEqual({ action: "remove" });
  });

  it("does nothing when already at/above the minimum with no existing line", () => {
    expect(planServiceMinimum([{ total_cents: 345_00, is_service_minimum: false }], MIN)).toEqual({
      action: "none",
    });
    expect(planServiceMinimum([{ total_cents: 185_00, is_service_minimum: false }], MIN)).toEqual({
      action: "none",
    });
  });
});

describe("isServiceMinimumEligible", () => {
  it("applies to standard and final invoices with no override", () => {
    expect(isServiceMinimumEligible({ invoiceKind: "standard", minimumServiceOverrideReason: null })).toBe(true);
    expect(isServiceMinimumEligible({ invoiceKind: "final", minimumServiceOverrideReason: null })).toBe(true);
  });

  it("never applies to a deposit invoice (precomputed total, no line items)", () => {
    expect(isServiceMinimumEligible({ invoiceKind: "deposit", minimumServiceOverrideReason: null })).toBe(false);
  });

  it("does not override an approved below-minimum estimate price", () => {
    expect(isServiceMinimumEligible({ invoiceKind: "final", minimumServiceOverrideReason: "owner_approved" })).toBe(false);
    expect(isServiceMinimumEligible({ invoiceKind: "standard", minimumServiceOverrideReason: "bundled" })).toBe(false);
  });
});
