import { describe, expect, it } from "vitest";
import { closeoutRollupFromExpenses } from "../closeout-rollup";

describe("closeoutRollupFromExpenses", () => {
  it("splits dump from materials and ignores SKUs", () => {
    const preview = closeoutRollupFromExpenses([
      {
        id: "m1",
        vendor_name: "The Home Depot",
        amount_cents: 13400,
        notes: "Paint",
        category: "materials",
      },
      {
        id: "m2",
        vendor_name: "The Home Depot",
        amount_cents: 1996,
        notes: "KILZ",
        category: "materials",
      },
      {
        id: "d1",
        vendor_name: "Town of Derry",
        amount_cents: 5080,
        notes: "Derry transfer station drop-off: demo debris",
        category: "other",
      },
    ]);
    expect(preview.materialsCents).toBe(15396);
    expect(preview.dumpCents).toBe(5080);
    expect(preview.dumpExpenseIds).toEqual(["d1"]);
  });
});
