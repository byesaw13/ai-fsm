import { describe, expect, it } from "vitest";
import { formatSupplyHouseOrderText } from "../quick-materials";
import type { MaterialsResult } from "../materials-generator";

function fakeItem(over: Partial<MaterialsResult["items"][number]>): MaterialsResult["items"][number] {
  return {
    name: "Item",
    brand: null,
    category: "general",
    base_quantity: 1,
    waste_factor_pct: 0,
    quantity: 1,
    unit: "ea",
    unit_cost_cents: 100,
    total_cost_cents: 100,
    confidence: "estimated",
    notes: "",
    price_book_id: null,
    ...over,
  };
}

const result: MaterialsResult = {
  items: [
    fakeItem({ name: "PVC trim board", quantity: 3, unit: "board", total_cost_cents: 4500, notes: "15% waste" }),
    fakeItem({ name: "OSI caulk", quantity: 2, unit: "tube", total_cost_cents: 1600, notes: "" }),
  ],
  summary_notes: "",
  total_cost_cents: 6100,
  assumptions: [],
  missing_measurements: [],
  excluded_customer_supplied_items: [],
};

describe("formatSupplyHouseOrderText", () => {
  it("renders a paste-ready checkbox order with notes and est total", () => {
    const text = formatSupplyHouseOrderText("Replace garage trim", result);

    expect(text).toContain("Scope: Replace garage trim");
    expect(text).toContain("[ ] 3 board - PVC trim board (15% waste)");
    // no notes -> no parenthetical
    expect(text).toContain("[ ] 2 tube - OSI caulk");
    expect(text).not.toContain("OSI caulk (");
    expect(text).toContain("Est Total: $61.00");
  });
});
