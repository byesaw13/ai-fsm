import { describe, expect, it } from "vitest";
import { explicitMaterialDepositCents, missingSurchargeLines } from "../itemized-preserve";

describe("explicitMaterialDepositCents", () => {
  it("does not add internal cost on top of materials lines", () => {
    expect(explicitMaterialDepositCents({ materialsLineCount: 1, aggregateCents: 20_000 })).toBe(0);
  });

  it("keeps an aggregate only when no materials line carries it", () => {
    expect(explicitMaterialDepositCents({ materialsLineCount: 0, aggregateCents: 4_000 })).toBe(4_000);
    expect(explicitMaterialDepositCents({ materialsLineCount: 0, aggregateCents: null })).toBe(0);
  });
});

describe("missingSurchargeLines", () => {
  it("adds travel and risk lines when those amounts are in the total and not already lines", () => {
    expect(missingSurchargeLines([], 5_000, 2_500)).toEqual([
      { description: "Travel surcharge", amountCents: 5_000 },
      { description: "Risk adjustment", amountCents: 2_500 },
    ]);
  });

  it("does not add a line that is already on the quote", () => {
    expect(missingSurchargeLines(["Travel surcharge"], 5_000, 0)).toEqual([]);
  });
});
