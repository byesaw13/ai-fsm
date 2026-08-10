import { describe, expect, it } from "vitest";
import { shoppingListToMaterialsBySection } from "../shopping-list-display";

describe("shoppingListToMaterialsBySection", () => {
  it("renders persisted specified takeoff items alongside computed materials", () => {
    const sections = shoppingListToMaterialsBySection({
      sections: [{
        section: "Hardware",
        computed_items: [{
          material: { id: "paint", material_name: "Primer", unit: "gal" },
          quantity: 1, total_cost_cents: 3000,
        }],
        specified_items: [{
          name: "Passage lockset", service_code: "1007", units_to_order: 1,
          unit_label: "each", unit_cost_cents: null, notes: null,
        }],
        section_total_cents: 3000,
      }],
      total_catalog_cost_cents: 3000, total_specified_cost_cents: 0, generated_at: "now",
    } as never);

    expect(sections[0].items.map((item) => item.material.material_name)).toEqual([
      "Primer", "Passage lockset",
    ]);
  });
});
