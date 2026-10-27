import { describe, expect, it } from "vitest";
import { priceBookLineForSubmit } from "../form-helpers";

const bookItem = {
  description: "LIFT — Boom lift",
  quantity: 1,
  unit_price_cents: 12_000,
  sort_order: 0,
  price_book_id: "pb-lift",
  price_book_code: "LIFT",
};

describe("priceBookLineForSubmit", () => {
  it("keeps an equipment type chosen on a price-book row", () => {
    const submitted = priceBookLineForSubmit(bookItem, {
      line_item_type: "equipment",
      hours_low: "2",
      hours_high: "2",
      hours_source: "owner",
    });
    expect(submitted.line_item_type).toBe("equipment");
    expect(submitted.unit_price_cents).toBe(12_000);
    expect(submitted.price_book_id).toBe("pb-lift");
    expect(submitted.hours_high).toBe(2);
    expect(submitted.hours_source).toBe("owner");
  });

  it("leaves the type off when the row has none", () => {
    const submitted = priceBookLineForSubmit(bookItem, {});
    expect(submitted).not.toHaveProperty("line_item_type");
    expect(submitted.hours_low).toBeNull();
  });
});
