import { describe, it, expect } from "vitest";
import {
  materialsCostForInternalPnl,
  internalPnlCostCents,
} from "../internal-pnl";

describe("materialsCostForInternalPnl", () => {
  it("prefers receipt materials over parts rollup (no double count)", () => {
    const r = materialsCostForInternalPnl({
      materialsReceiptCents: 23032,
      partsRollupCents: 23032,
    });
    expect(r).toEqual({ materialsCents: 23032, source: "receipts" });
  });

  it("falls back to parts rollup when no receipts", () => {
    const r = materialsCostForInternalPnl({
      materialsReceiptCents: 0,
      partsRollupCents: 5000,
    });
    expect(r).toEqual({ materialsCents: 5000, source: "parts_rollup" });
  });

  it("returns none when both empty", () => {
    expect(
      materialsCostForInternalPnl({ materialsReceiptCents: 0, partsRollupCents: 0 }).source,
    ).toBe("none");
  });
});

describe("internalPnlCostCents", () => {
  it("uses actual labor + receipt materials once", () => {
    expect(
      internalPnlCostCents({
        laborCostCents: 15000,
        materialsReceiptCents: 23032,
        partsRollupCents: 23032,
      }),
    ).toBe(38032);
  });

  it("does not invent cost when nothing is known", () => {
    expect(
      internalPnlCostCents({
        laborCostCents: null,
        materialsReceiptCents: 0,
        partsRollupCents: 0,
      }),
    ).toBeNull();
  });
});
