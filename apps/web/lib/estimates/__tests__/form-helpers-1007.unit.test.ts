import { describe, expect, it } from "vitest";
import { buildManualShoppingList } from "../form-helpers";
import type { PriceBookEntry } from "@/app/app/estimates/new/hooks/useEstimatePriceBook";
import type { ScopeBuilderResult } from "@/components/ScopeBuilder";

const doorHardware: PriceBookEntry = {
  instanceId: "i1",
  priceCents: 18500,
  service: {
    id: "pb-1007",
    code: "1007",
    name: "Door hardware replacement",
    category: "general_repairs",
    tier: "standard",
    price_min_cents: 15000,
    price_max_cents: null,
    default_price_cents: 18500,
    add_on_price_cents: null,
    unit_type: "each",
    description: null,
    notes: null,
    default_labor_hours: 1,
    requires_materials: true,
    upsell_codes: [],
    is_active: true,
  },
};

const drywallScope = {
  components: {},
  complexity: {},
  multiplier: 1,
  adderCents: 0,
  adjustedPriceCents: 18500,
  violations: [],
  materials: [
    {
      material: { id: "compound", material_name: "Joint compound", unit: "gal" },
      quantity: 1,
      total_cost_cents: 3000,
    },
    {
      material: { id: "tape", material_name: "Fiberglass mesh tape", unit: "roll" },
      quantity: 1,
      total_cost_cents: 800,
    },
  ],
  materialTotalCents: 3800,
  laborEstimate: null,
  isProductionBased: false,
  productionDailyRateCents: null,
} as unknown as ScopeBuilderResult;

describe("buildManualShoppingList — TASK-103 1007-only", () => {
  it("does not pull general_repairs mud/tape for a 1007-only estimate", () => {
    const list = buildManualShoppingList([doorHardware], { i1: drywallScope });
    expect(list).not.toBeNull();
    const names = (list?.sections ?? []).flatMap((sec) => [
      ...sec.computed_items.map((i) => i.material.material_name),
      ...sec.specified_items.map((i) => i.name),
    ]);
    expect(names.some((n) => /compound|mesh tape|mud/i.test(n))).toBe(false);
    expect(names.some((n) => n.toLowerCase().includes("lockset"))).toBe(true);
    expect(list?.sections.every((sec) => sec.computed_items.length === 0)).toBe(true);
  });
});
