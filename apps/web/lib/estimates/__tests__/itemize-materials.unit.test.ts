import { describe, it, expect, vi } from "vitest";
import { buildAssessmentSummary, summarizePreparedScope, type PreparedScope, type PreparedTask } from "@ai-fsm/domain";
import { groupMaterialsScope, itemizeGroups, preparedShoppingList, toMaterialList } from "../itemize-materials";
import { applyScopeEdits } from "../prepare-quote";
import type { MaterialsResult } from "../materials-generator";
import { shoppingListToMaterialsBySection } from "../shopping-list-display";
import { mapShoppingListJsonToLines } from "@/lib/jobs/buy-list";

function task(t: Partial<PreparedTask> & Pick<PreparedTask, "id" | "group_key" | "description">): PreparedTask {
  return {
    room_id: null, kind: "requested", confirmed: true, quantity_key: null, count: null, quantity: null,
    hours_low: 2, hours_high: 3, hours_source: "ai_allowance", materials_cents: 75000, ...t,
  };
}

const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: "a1", assessment_updated_at: null },
  groups: [{ key: "bath", label: "Bathroom" }, { key: "hall", label: "Hall" }],
  tasks: [
    task({ id: "t1", room_id: "r4", group_key: "bath", description: "Replace toilet and vanity" }),
    task({ id: "t2", room_id: "r4", group_key: "bath", description: "Paint walls", quantity: { key: "net_wall_sqft", value: 243.4, unit: "sqft", basis: "assumed" }, materials_cents: null }),
    task({ id: "t3", room_id: "r4", group_key: "bath", description: "Optional upgrade", confirmed: false }),
    task({ id: "t4", room_id: "h1", group_key: "hall", description: "Paint hall", materials_cents: 9000 }),
  ],
  questions: [],
  alternatives: [],
  exclusions: [],
};

const RESULT: MaterialsResult = {
  items: [
    { name: "Toilet, elongated", brand: "American Standard", category: "plumbing", base_quantity: 1, waste_factor_pct: 0, quantity: 1, unit: "each", unit_cost_cents: 28900, total_cost_cents: 28900, confidence: "estimated", notes: "", price_book_id: null },
    { name: "Interior paint", brand: null, category: "paint", base_quantity: 1.4, waste_factor_pct: 10, quantity: 2, unit: "gallon", unit_cost_cents: 5500, total_cost_cents: 11000, confidence: "calculated", notes: "2 coats", price_book_id: "pb-paint" },
  ],
  summary_notes: "",
  total_cost_cents: 39900,
  assumptions: ["Standard 30 in vanity"],
  missing_measurements: [],
  excluded_customer_supplied_items: ["Faucet"],
};

const SUMMARY = buildAssessmentSummary({
  visitId: "v1",
  assessmentId: "a1",
  rooms: [
    { id: "r4", name: "Bathroom", length_ft: 12, width_ft: 8, height_ft: 8, notes: "" },
    { id: "h1", name: "Hall", length_ft: 30, width_ft: 4, height_ft: 9, notes: "" },
  ],
});

describe("itemized materials (TASK-187)", () => {
  it("asks for one area's included work only, with its quantities", () => {
    const text = groupMaterialsScope(SCOPE, "bath");
    expect(text).toMatch(/Work area: Bathroom/);
    expect(text).toMatch(/- Paint walls \(243\.4 sqft\)/);
    expect(text).not.toMatch(/Optional upgrade|Paint hall/);
  });

  it("stores the generator's items, labeling saved prices and estimates", () => {
    const list = toMaterialList(RESULT, ["t1", "t2"]);
    expect(list.lines).toEqual([
      expect.objectContaining({ id: "m1", name: "American Standard Toilet, elongated", quantity: 1, unit_cost_cents: 28900, source: "ai_estimate" }),
      expect.objectContaining({ id: "m2", name: "Interior paint", quantity: 2, unit: "gallon", source: "your_price", price_book_id: "pb-paint" }),
    ]);
    expect(list).toMatchObject({ task_ids: ["t1", "t2"], customer_supplied: ["Faucet"], assumptions: ["Standard 30 in vanity"] });
  });

  it("lists each requested area with its own rooms, and reports an area that fails", async () => {
    const generate = vi.fn(async (input: { scope: string; rooms?: Array<{ id: string }> }) => {
      if (input.scope.includes("Hall")) throw new Error("overloaded");
      return RESULT;
    });
    const { scope, failed } = await itemizeGroups(SCOPE, SUMMARY, ["bath", "hall", "bath"], [], generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.find((c) => c[0].scope.includes("Bathroom"))![0].rooms!.map((r) => r.id)).toEqual(["r4"]);
    expect(scope.materials?.bath.lines).toHaveLength(2);
    expect(scope.materials?.hall).toBeUndefined();
    expect(failed).toEqual([{ group_key: "hall", message: expect.any(String) }]);
    // The bathroom's materials now come from the list: $289 + 2 x $55
    expect(summarizePreparedScope(scope).groups.find((g) => g.key === "bath")!.materials_cents).toBe(39900);
  });

  it("writes the standard shopping list: one section per area, lines as specified items (TASK-223)", () => {
    const scope = { ...SCOPE, materials: { bath: toMaterialList(RESULT, ["t1", "t2"]) } };
    const list = preparedShoppingList(scope)!;
    expect(list.sections).toHaveLength(1);
    expect(list.sections[0]).toMatchObject({ section: "Bathroom", computed_items: [], section_total_cents: 28900 + 11000 });
    expect(list.sections[0].specified_items.map((i) => [i.name, i.units_to_order, i.unit_label, i.unit_cost_cents])).toEqual([
      ["American Standard Toilet, elongated", 1, "each", 28900],
      ["Interior paint", 2, "gallon", 5500],
    ]);
    expect(list.total_specified_cost_cents).toBe(39900);
    expect(preparedShoppingList(SCOPE)).toBeNull();
  });

  it("an itemized quote whose materials are all zeroed writes an empty list, so the old one is replaced", () => {
    const zeroed = toMaterialList(RESULT, ["t1", "t2"]);
    zeroed.lines = zeroed.lines.map((l) => ({ ...l, quantity: 0 }));
    const list = preparedShoppingList({ ...SCOPE, materials: { bath: zeroed } })!;
    expect(list).not.toBeNull();
    expect(list.sections).toEqual([]);
    expect(list.total_specified_cost_cents).toBe(0);
    expect(preparedShoppingList({ ...SCOPE, materials: {} })!.sections).toEqual([]);
  });

  it("is readable by every page that reads a shopping list (the print page crashed on the old shape)", () => {
    const list = preparedShoppingList({ ...SCOPE, materials: { bath: toMaterialList(RESULT, ["t1", "t2"]) } })!;
    const stored = JSON.parse(JSON.stringify(list));
    // Shopping-list page
    const bySection = shoppingListToMaterialsBySection(stored);
    expect(bySection[0].items.map((i) => [i.material.material_name, i.quantity])).toEqual([
      ["American Standard Toilet, elongated", 1],
      ["Interior paint", 2],
    ]);
    // Buy list seed
    expect(mapShoppingListJsonToLines(stored).map((l) => [l.name, l.quantity])).toEqual([
      ["American Standard Toilet, elongated", 1],
      ["Interior paint", 2],
    ]);
    // Print page reads both arrays on every section
    for (const sec of stored.sections) {
      expect(Array.isArray(sec.specified_items) && Array.isArray(sec.computed_items)).toBe(true);
    }
  });

  it("keeps the owner's quantity, price and removals, and nothing else from the client", () => {
    const stored = { ...SCOPE, materials: { bath: toMaterialList(RESULT, ["t1", "t2"]) } };
    const edited: PreparedScope = {
      ...stored,
      materials: {
        bath: {
          ...stored.materials.bath,
          lines: [{ ...stored.materials.bath.lines[0], quantity: 2, unit_cost_cents: 31000, name: "Hacked name" }],
        },
        hall: { task_ids: [], lines: [], customer_supplied: [], assumptions: [] },
      },
    };
    const merged = applyScopeEdits(stored, edited);
    expect(merged.materials?.bath.lines).toEqual([
      expect.objectContaining({ id: "m1", name: "American Standard Toilet, elongated", quantity: 2, unit_cost_cents: 31000, source: "owner" }),
    ]);
    expect(merged.materials?.hall).toBeUndefined();
  });
});
