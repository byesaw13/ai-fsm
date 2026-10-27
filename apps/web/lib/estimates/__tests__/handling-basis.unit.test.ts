import { describe, expect, it } from "vitest";
import { handlingBasisCents, type LineItemRow } from "../form-helpers";

function row(over: Partial<LineItemRow> & Pick<LineItemRow, "description" | "unit_price">): LineItemRow {
  return { quantity: "1", ...over };
}

describe("handlingBasisCents", () => {
  it("a $120 equipment line leaves the handling amount unchanged, even when the description says material", () => {
    const materials = row({
      description: "Paint materials",
      unit_price: "100.00",
      unit_cost_cents: 10_000,
      line_item_type: "materials",
    });
    const equipment = row({
      description: "Lift rental materials",
      unit_price: "120.00",
      unit_cost_cents: 12_000,
      line_item_type: "equipment",
    });
    const before = handlingBasisCents([materials]);
    const after = handlingBasisCents([materials, equipment]);
    expect(before).toBe(10_000);
    expect(after).toBe(before);
    expect(Math.round(after * 0.15)).toBe(1_500);
  });
});
