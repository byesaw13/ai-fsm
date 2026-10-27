import { describe, it, expect } from "vitest";
import { EMPTY_ROW, rowToLineItemPayload, savedLineToRow } from "../form-helpers";

// Saving the estimate edit form used to send only description/quantity/price,
// so the API defaulted every line to "labor" and dropped the price-book link
// and prepared group (TASK-179 slice 3).
describe("edit form line round trip", () => {
  it("keeps a materials line a materials line", () => {
    const saved = {
      description: "Bathroom materials allowance",
      quantity: 1,
      unit_price_cents: 24000,
      line_item_type: "materials" as const,
      visible_to_customer: true,
      adjustment_type: null,
      price_book_id: null,
      prepared_group_key: "bath_floor",
    };
    expect(rowToLineItemPayload(savedLineToRow(saved), 3)).toEqual({
      description: "Bathroom materials allowance",
      quantity: 1,
      unit_price_cents: 24000,
      sort_order: 3,
      line_item_type: "materials",
      visible_to_customer: true,
      prepared_group_key: "bath_floor",
      hours_low: null,
      hours_high: null,
      hours_source: null,
    });
  });

  it("keeps hidden lines hidden and the price-book link", () => {
    const row = savedLineToRow({
      description: "Internal handling",
      quantity: 1,
      unit_price_cents: 500,
      line_item_type: "handling_fee",
      visible_to_customer: false,
      price_book_id: "11111111-1111-1111-1111-111111111111",
    });
    expect(rowToLineItemPayload(row, 0)).toMatchObject({
      line_item_type: "handling_fee",
      visible_to_customer: false,
      price_book_id: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("an edited price keeps the line's type and group", () => {
    const row = { ...savedLineToRow({ description: "Labor", quantity: 6.5, unit_price_cents: 8500, line_item_type: "labor", prepared_group_key: "room1" }), unit_price: "90.00" };
    expect(rowToLineItemPayload(row, 0)).toMatchObject({ unit_price_cents: 9000, line_item_type: "labor", prepared_group_key: "room1" });
  });

  it("keeps a materials cost when the price is edited", () => {
    const row = {
      ...savedLineToRow({
        description: "Paint",
        quantity: 1,
        unit_price_cents: 24_000,
        unit_cost_cents: 20_000,
        line_item_type: "materials",
      }),
      unit_price: "26.00",
    };
    expect(rowToLineItemPayload(row, 0)).toMatchObject({
      unit_price_cents: 2600,
      unit_cost_cents: 20_000,
      line_item_type: "materials",
    });
  });

  it("a new row takes the API defaults and belongs to the owner", () => {
    expect(rowToLineItemPayload({ ...EMPTY_ROW, description: "Extra" }, 1)).toEqual({
      description: "Extra",
      quantity: 1,
      unit_price_cents: 0,
      sort_order: 1,
      hours_low: null,
      hours_high: null,
      hours_source: null,
    });
  });
});
