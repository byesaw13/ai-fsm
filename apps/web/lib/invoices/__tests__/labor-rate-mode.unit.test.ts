import { describe, expect, it } from "vitest";
import { laborLineInputForMode } from "../labor-rate-mode";

describe("laborLineInputForMode", () => {
  const hourly = {
    trackedMinutes: 90,
    billingRateCentsPerHour: 11500,
  };

  it("hourly: quarter-hour hours at the bill rate", () => {
    expect(laborLineInputForMode({ mode: "hourly", ...hourly })).toEqual({
      description: "Labor",
      quantity: 1.5,
      unit_price_cents: 11500,
      line_item_type: "labor",
    });
  });

  it("hourly with no tracked time throws NO_TRACKED_TIME", () => {
    expect(() =>
      laborLineInputForMode({ mode: "hourly", trackedMinutes: 0, billingRateCentsPerHour: 11500 }),
    ).toThrow(/No completed visit time/);
  });

  it("price_book: one line at the task rate", () => {
    expect(
      laborLineInputForMode({
        mode: "price_book",
        ...hourly,
        priceBookName: "Faucet install",
        priceBookCents: 18500,
      }),
    ).toEqual({
      description: "Faucet install",
      quantity: 1,
      unit_price_cents: 18500,
      line_item_type: "labor",
    });
  });

  it("price_book without a rate throws VALIDATION_ERROR", () => {
    expect(() =>
      laborLineInputForMode({ mode: "price_book", ...hourly, priceBookName: "X" }),
    ).toThrow(/price-book/);
  });

  it("flat: one line at the typed fee", () => {
    expect(
      laborLineInputForMode({ mode: "flat", ...hourly, flatCents: 20000 }),
    ).toEqual({
      description: "Labor",
      quantity: 1,
      unit_price_cents: 20000,
      line_item_type: "labor",
    });
  });

  it("flat without an amount throws VALIDATION_ERROR", () => {
    expect(() => laborLineInputForMode({ mode: "flat", ...hourly })).toThrow(/flat fee/);
  });
});
