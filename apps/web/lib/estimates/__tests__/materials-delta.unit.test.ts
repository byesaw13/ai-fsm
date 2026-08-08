import { describe, it, expect } from "vitest";
import {
  attachAiSnapshot,
  buildAiMaterialsDelta,
  reconcileAiMaterialsDelta,
  withAiMaterialsDelta,
  type AiMaterialsDeltaItem,
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
        key: expect.any(String),
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

  it("uses provided keys aligned to the original (pre-filter) items array", () => {
    const manual = item({ name: "Manual item" }); // no ai_ fields — filtered out
    const [snapshotted] = attachAiSnapshot([item()]);
    // keys[0] belongs to `manual` (filtered out), keys[1] belongs to `snapshotted`
    const delta = buildAiMaterialsDelta([manual, snapshotted], ["manual-key", "ai-key"]);
    expect(delta).toHaveLength(1);
    expect(delta[0].key).toBe("ai-key");
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

describe("reconcileAiMaterialsDelta", () => {
  function deltaEntry(overrides: Partial<AiMaterialsDeltaItem> = {}): AiMaterialsDeltaItem {
    return {
      key: "k1",
      name: "5/4x6x12 PT decking",
      category: "lumber",
      unit: "board",
      ai_quantity: 8,
      quantity: 8,
      ai_unit_cost_cents: 1500,
      unit_cost_cents: 1500,
      ...overrides,
    };
  }

  it("drops an entry whose line item was removed from the estimate after add", () => {
    const delta = [deltaEntry({ key: "removed-key" })];
    const lineItemsByKey = new Map<string, { unit_price: string }>(); // line no longer exists
    expect(reconcileAiMaterialsDelta(delta, lineItemsByKey)).toEqual([]);
  });

  it("keeps an entry unchanged when the line survives with the same price", () => {
    const delta = [deltaEntry({ key: "k1", quantity: 8, unit_cost_cents: 1500 })];
    // 8 * $15.00 = $120.00 total, matching the original unedited line
    const lineItemsByKey = new Map([["k1", { unit_price: "120.00" }]]);
    const reconciled = reconcileAiMaterialsDelta(delta, lineItemsByKey);
    expect(reconciled).toEqual(delta);
  });

  it("recomputes unit_cost_cents from the line's current total when re-priced after add", () => {
    const delta = [deltaEntry({ key: "k1", quantity: 8, unit_cost_cents: 1500 })];
    // Founder edited the flattened line's total from $120.00 to $130.00 after adding it
    const lineItemsByKey = new Map([["k1", { unit_price: "130.00" }]]);
    const [reconciled] = reconcileAiMaterialsDelta(delta, lineItemsByKey);
    expect(reconciled.unit_cost_cents).toBe(1625); // 13000 / 8
    expect(reconciled.quantity).toBe(8); // not separately recoverable post-flatten — held at add-time value
    expect(reconciled.ai_quantity).toBe(8); // AI's original proposal is untouched either way
  });

  it("handles a mix of removed, unchanged, and re-priced lines in one call", () => {
    const delta = [
      deltaEntry({ key: "keep", name: "Keep" }),
      deltaEntry({ key: "gone", name: "Gone" }),
      deltaEntry({ key: "reprice", name: "Reprice", quantity: 2, unit_cost_cents: 1000 }),
    ];
    const lineItemsByKey = new Map([
      ["keep", { unit_price: "120.00" }], // 8 * $15.00 unchanged — matches deltaEntry default
      ["reprice", { unit_price: "25.00" }], // was 2 * $10.00 = $20.00, now $25.00
    ]);
    const reconciled = reconcileAiMaterialsDelta(delta, lineItemsByKey);
    expect(reconciled.map((d) => d.name)).toEqual(["Keep", "Reprice"]);
    expect(reconciled.find((d) => d.name === "Reprice")?.unit_cost_cents).toBe(1250); // 2500 / 2
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
