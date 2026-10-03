import { describe, expect, it } from "vitest";
import { estimateReviewHealth, lineNeedsPriceReview } from "../review-health";

describe("estimate review health", () => {
  it("asks for review when the description is blank or the price is not positive", () => {
    expect(lineNeedsPriceReview({ id: "a", description: "  ", unit_price_cents: 100 })).toBe(true);
    expect(lineNeedsPriceReview({ id: "b", description: "Paint", unit_price_cents: 0 })).toBe(true);
    expect(lineNeedsPriceReview({ id: "c", description: "Paint", unit_price_cents: "1500" })).toBe(false);
  });

  it("counts ready items and points at the first one that needs review", () => {
    expect(estimateReviewHealth([
      { id: "ready", description: "Paint walls", unit_price_cents: 12000 },
      { id: "blank", description: "", unit_price_cents: 5000 },
      { id: "free", description: "Touch-up", unit_price_cents: 0 },
    ])).toEqual({ total: 3, ready: 1, needsReview: 2, firstId: "blank" });
  });
});
