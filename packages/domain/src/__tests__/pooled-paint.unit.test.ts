import { describe, it, expect } from "vitest";
import { pooledPaint, summarizePreparedScope, type PreparedMaterialList, type PreparedScope } from "../prepared-scope";

const EMERALD = "Sherwin-Williams Emerald Interior Acrylic Latex — wall color";

function list(lines: Array<[string, number, string?, number?]>): PreparedMaterialList {
  return {
    task_ids: [],
    lines: lines.map(([name, quantity, unit = "gallon", cost = 8500], i) => ({
      id: `m${i + 1}`, name, quantity, unit, unit_cost_cents: cost, source: "ai_estimate", price_book_id: null, notes: "",
    })),
    customer_supplied: [],
    assumptions: [],
  };
}

function scope(materials: Record<string, PreparedMaterialList>, pool_paint?: boolean): PreparedScope {
  const keys = Object.keys(materials);
  return {
    version: 1,
    source: { visit_id: "v", assessment_id: null, assessment_updated_at: null },
    groups: keys.map((key) => ({ key, label: key })),
    tasks: keys.map((key, i) => ({
      id: `t${i + 1}`, room_id: null, description: "Paint walls", kind: "requested", confirmed: true, group_key: key,
      quantity_key: null, count: null, quantity: null, hours_low: 1, hours_high: 2, hours_source: "ai_allowance", materials_cents: null,
    })),
    questions: [],
    alternatives: [],
    exclusions: [],
    materials,
    pool_paint,
  };
}

// The nine Dowd rooms after itemizing (2026-10-31), plus a primer only one room uses.
const DOWD = {
  hall: list([[EMERALD, 1.75]]),
  foyer: list([[EMERALD, 2.5]]),
  dining: list([[EMERALD, 1.75]]),
  office: list([[EMERALD, 1.75]]),
  pantry: list([[EMERALD, 1.5]]),
  kitchen: list([[EMERALD, 1.5]]),
  mudroom: list([[EMERALD, 1]]),
  sons_room: list([["Zinsser Gardz Problem Surface Sealer 1 gal", 1, "gallon", 4000], [EMERALD, 0.75]]),
  living_room: list([[EMERALD, 4.25]]),
};

describe("pooledPaint (TASK-227)", () => {
  it("is off unless the owner turns it on", () => {
    expect(pooledPaint(scope(DOWD))).toEqual([]);
  });

  it("buys one product shared by rooms as 5-gal pails, then whole gallons", () => {
    const [p] = pooledPaint(scope(DOWD, true));
    expect(p).toMatchObject({ name: EMERALD, needed: 16.75, pails: 3, gallons: 2, quarts: 0, unit_cost_cents: 8500, cost_cents: 17 * 8500 });
  });

  it("leaves a product only one room uses alone", () => {
    expect(pooledPaint(scope(DOWD, true)).map((p) => p.name)).toEqual([EMERALD]);
  });

  it("room shares add up to the purchase and follow each room's need", () => {
    const [p] = pooledPaint(scope(DOWD, true));
    const total = Object.values(p.shares).reduce((a, b) => a + b, 0);
    expect(total).toBe(p.cost_cents);
    expect(p.shares.living_room).toBeGreaterThan(p.shares.hall);
  });

  it("uses quarts only when the whole need is under a gallon", () => {
    const [p] = pooledPaint(scope({ a: list([["Trim enamel", 0.25]]), b: list([["Trim enamel", 0.25]]) }, true));
    expect(p).toMatchObject({ pails: 0, gallons: 0, quarts: 2, cost_cents: 2 * 2125 });
  });

  it("does not pool different products, unpriced lines, or non-gallon units", () => {
    const s = scope({ a: list([["Paint A", 2], ["Tape", 3, "each"], ["Paint C", 1, "gallon", 0]]), b: list([["Paint B", 2], ["Tape", 3, "each"]]) }, true);
    s.materials!.a.lines[2].unit_cost_cents = null;
    s.materials!.b.lines.push({ ...s.materials!.a.lines[2], id: "m9" });
    expect(pooledPaint(s)).toEqual([]);
  });
});

describe("summarizePreparedScope with pooled paint (TASK-227)", () => {
  it("each room carries its share of the real purchase; the primer stays as listed", () => {
    const off = summarizePreparedScope(scope(DOWD));
    const on = summarizePreparedScope(scope(DOWD, true));
    expect(off.materials_cents).toBe(Math.round(16.75 * 8500) + 4000);
    expect(on.materials_cents).toBe(17 * 8500 + 4000);
    const sons = on.groups.find((g) => g.key === "sons_room")!;
    expect(sons.materials_cents).toBeGreaterThan(4000);
  });
});
