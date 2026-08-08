import { describe, it, expect } from "vitest";
import {
  attachAiSnapshot,
  buildAiMaterialsDelta,
  withAiMaterialsDelta,
  type MaterialItemLike,
} from "../materials-delta";

// TASK T1 — materials estimate trust calibration (Approach D). These cover
// the pure delta-capture logic shared by MaterialsGenerator.tsx,
// Step2Pricing.tsx, and useEstimateForm.ts.

function item(overrides: Partial<MaterialItemLike> = {}): MaterialItemLike {
  return {
    name: "5/4x6x12 PT decking",
    category: "lumber",
    unit: "board",
    quantity: 8,
    unit_cost_cents: 1500,
    ...overrides,
  };
}

describe("attachAiSnapshot", () => {
  it("snapshots quantity/unit_cost_cents into ai_quantity/ai_unit_cost_cents", () => {
    const [snapshotted] = attachAiSnapshot([item()]);
    expect(snapshotted.ai_quantity).toBe(8);
    expect(snapshotted.ai_unit_cost_cents).toBe(1500);
    // Original mutable fields are untouched.
    expect(snapshotted.quantity).toBe(8);
    expect(snapshotted.unit_cost_cents).toBe(1500);
  });

  it("is idempotent — never overwrites an existing snapshot", () => {
    const snapshotted = attachAiSnapshot([item({ ai_quantity: 8, ai_unit_cost_cents: 1500 })]);
    // Simulate a founder edit on the mutable fields, then re-snapshot
    // (should never happen in practice, but the helper must not clobber it).
    const edited = { ...snapshotted[0], quantity: 10, unit_cost_cents: 1600 };
    const [reSnapshotted] = attachAiSnapshot([edited]);
    expect(reSnapshotted.ai_quantity).toBe(8);
    expect(reSnapshotted.ai_unit_cost_cents).toBe(1500);
    expect(reSnapshotted.quantity).toBe(10);
    expect(reSnapshotted.unit_cost_cents).toBe(1600);
  });
});

describe("buildAiMaterialsDelta", () => {
  it("excludes items with no AI snapshot (manually-added price-book items)", () => {
    const manual = item({ name: "Manual item" }); // no ai_ fields
    expect(buildAiMaterialsDelta([manual])).toEqual([]);
  });

  it("captures both the AI-proposed and founder-edited values for edited items", () => {
    const [snapshotted] = attachAiSnapshot([item()]);
    const edited = { ...snapshotted, quantity: 10, unit_cost_cents: 1300 };
    const delta = buildAiMaterialsDelta([edited]);
    expect(delta).toEqual([
      {
        name: "5/4x6x12 PT decking",
        category: "lumber",
        unit: "board",
        ai_quantity: 8,
        quantity: 10,
        ai_unit_cost_cents: 1500,
        unit_cost_cents: 1300,
      },
    ]);
  });

  it("still captures unedited items (delta shows no meaningful difference)", () => {
    const [snapshotted] = attachAiSnapshot([item()]);
    const delta = buildAiMaterialsDelta([snapshotted]);
    expect(delta).toHaveLength(1);
    expect(delta[0].ai_quantity).toBe(delta[0].quantity);
    expect(delta[0].ai_unit_cost_cents).toBe(delta[0].unit_cost_cents);
  });

  it("survives a removeItem-then-add flow without index corruption", () => {
    // Three generated items, snapshotted immediately (mirrors MaterialsGenerator.generate()).
    const generated = attachAiSnapshot([
      item({ name: "Item A", quantity: 1 }),
      item({ name: "Item B", quantity: 2 }),
      item({ name: "Item C", quantity: 3 }),
    ]);
    // removeItem(1) filters "Item B" out by index — remaining items keep their identity.
    const afterRemoval = generated.filter((_, i) => i !== 1);
    expect(afterRemoval.map((i) => i.name)).toEqual(["Item A", "Item C"]);

    // Founder edits the survivor at its new index 1 ("Item C").
    const edited = afterRemoval.map((it, i) => (i === 1 ? { ...it, quantity: 5 } : it));

    const delta = buildAiMaterialsDelta(edited);
    expect(delta).toHaveLength(2);
    expect(delta.find((d) => d.name === "Item A")).toMatchObject({ ai_quantity: 1, quantity: 1 });
    expect(delta.find((d) => d.name === "Item C")).toMatchObject({ ai_quantity: 3, quantity: 5 });
    expect(delta.find((d) => d.name === "Item B")).toBeUndefined();
  });
});

describe("withAiMaterialsDelta", () => {
  it("returns sl unchanged when there is no delta (no regression for non-AI estimates)", () => {
    const sl = { sections: [], total_catalog_cost_cents: 0, total_specified_cost_cents: 0, generated_at: "now" };
    expect(withAiMaterialsDelta(sl, [])).toBe(sl);
    expect(withAiMaterialsDelta(null, [])).toBeNull();
  });

  it("merges the delta into an existing shopping list under its own key", () => {
    const sl = { sections: [{ foo: "bar" }] };
    const delta = buildAiMaterialsDelta(attachAiSnapshot([item()]));
    const merged = withAiMaterialsDelta(sl, delta);
    expect(merged).toMatchObject({ sections: [{ foo: "bar" }], ai_materials_delta: delta });
  });

  it("emits a standalone object when sl is null but a delta exists", () => {
    const delta = buildAiMaterialsDelta(attachAiSnapshot([item()]));
    const merged = withAiMaterialsDelta(null, delta);
    expect(merged).toEqual({ ai_materials_delta: delta });
  });
});
