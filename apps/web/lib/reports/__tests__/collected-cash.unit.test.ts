import { describe, expect, it } from "vitest";
import { collectedCashStatusSql, countsAsCollectedCash } from "../collected-cash";

describe("collected cash", () => {
  it("counts only payments that cleared", () => {
    expect(countsAsCollectedCash("paid")).toBe(true);
    expect(countsAsCollectedCash("pending")).toBe(false);
    expect(countsAsCollectedCash("refunded")).toBe(false);
    expect(countsAsCollectedCash("failed")).toBe(false);
    expect(countsAsCollectedCash("cancelled")).toBe(false);
    expect(collectedCashStatusSql()).toBe("status = 'paid'");
  });
});
