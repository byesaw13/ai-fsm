import { describe, expect, it } from "vitest";
import { materialsBudgetCopy } from "../MaterialsBudgetLine";

describe("materialsBudgetCopy", () => {
  it("is empty when there is no allowance and no spend", () => {
    expect(materialsBudgetCopy(null, 0)).toEqual({ kind: "empty" });
    expect(materialsBudgetCopy(undefined, 0)).toEqual({ kind: "empty" });
  });

  it("shows spent when receipts exist but there is no allowance", () => {
    expect(materialsBudgetCopy(null, 18500)).toEqual({
      kind: "spent_only",
      spentLabel: "$185.00",
    });
  });

  it("compares allowance vs spent when an allowance exists", () => {
    expect(materialsBudgetCopy(20000, 5000)).toEqual({
      kind: "compare",
      allowanceLabel: "$200.00",
      spentLabel: "$50.00",
      varianceLabel: "$150.00 remaining",
    });
    expect(materialsBudgetCopy(20000, 25000)).toEqual({
      kind: "compare",
      allowanceLabel: "$200.00",
      spentLabel: "$250.00",
      varianceLabel: "$50.00 over",
    });
  });
});
