import { describe, it, expect } from "vitest";
import {
  allocateFixedPrice,
  modelPreparedProfit,
  type PreparedScope,
  type PreparedTask,
} from "../prepared-scope";

function task(t: Partial<PreparedTask> & Pick<PreparedTask, "id" | "group_key">): PreparedTask {
  return {
    room_id: null, description: t.id, kind: "requested", confirmed: true, quantity_key: null, count: null,
    quantity: null, hours_low: null, hours_high: null, hours_source: null, materials_cents: null, ...t,
  };
}

// The owner's demonstration figures: 32–51 h, $1,305 materials.
const BASE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: null, assessment_updated_at: null },
  groups: [
    { key: "room1", label: "Room 1" },
    { key: "room2", label: "Room 2" },
    { key: "room3", label: "Room 3" },
    { key: "bath", label: "Bathroom" },
    { key: "floor", label: "Bathroom floor" },
  ],
  tasks: [
    task({ id: "a", group_key: "room1", hours_low: 5, hours_high: 8, materials_cents: 8500 }),
    task({ id: "b", group_key: "room2", hours_low: 3, hours_high: 5, materials_cents: 4000 }),
    task({ id: "c", group_key: "room3", hours_low: 3, hours_high: 5, materials_cents: 19000 }),
    task({ id: "d", group_key: "bath", hours_low: 15, hours_high: 23, materials_cents: 75000 }),
    task({ id: "e", group_key: "floor", hours_low: 6, hours_high: 10, materials_cents: 24000 }),
  ],
  questions: [],
  alternatives: [],
  exclusions: [],
};

const RATES = { laborRateCents: 8500, laborCostCents: 5000 };

describe("modelPreparedProfit", () => {
  it("reference scenario: 42 h × $50, $300 overhead, 12% reserve, $5,500 fixed", () => {
    const scope: PreparedScope = {
      ...BASE,
      pricing: { mode: "fixed", fixed_price_cents: 550_000, expected_hours: 42, overhead_cents: 30_000, reserve_pct: 12 },
    };
    const m = modelPreparedProfit(scope, RATES);
    expect(m.tm_low_cents).toBe(402_500);
    expect(m.tm_high_cents).toBe(564_000);
    expect(m.labor_cost_cents).toBe(210_000);
    expect(m.materials_cents).toBe(130_500);
    expect(m.modeled_cost_cents).toBe(370_500);
    expect(m.reserve_cents).toBe(44_460);
    expect(m.sell_cents).toBe(550_000);
    expect(m.remainder_cents).toBe(135_040);
    expect(m.margin_pct).toBe(24.55);
  });

  it("T&M with no pricing set: expected hours default to the midpoint, no overhead or reserve", () => {
    const m = modelPreparedProfit(BASE, RATES);
    expect(m.mode).toBe("tm");
    expect(m.expected_hours).toBe(41.5);
    expect(m.sell_cents).toBe(Math.round(41.5 * 8500) + 130_500);
    expect(m.overhead_cents).toBe(0);
    expect(m.reserve_cents).toBe(0);
  });

  it("fixed mode without a price has no sell price and no margin", () => {
    const m = modelPreparedProfit({ ...BASE, pricing: { mode: "fixed", fixed_price_cents: null, expected_hours: null, overhead_cents: 0, reserve_pct: 0 } }, RATES);
    expect(m.sell_cents).toBeNull();
    expect(m.remainder_cents).toBeNull();
    expect(m.margin_pct).toBeNull();
  });
});

describe("allocateFixedPrice", () => {
  it("keeps each room's materials and splits the rest by labor share, summing exactly to the price", () => {
    const lines = allocateFixedPrice(BASE, 8500, 550_000);
    expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(550_000);
    const materials = lines.filter((l) => l.kind === "materials");
    expect(materials.map((l) => [l.group_key, l.cents])).toEqual([
      ["room1", 8500], ["room2", 4000], ["room3", 19000], ["bath", 75000], ["floor", 24000],
    ]);
    const labor = lines.filter((l) => l.kind === "labor");
    expect(labor.reduce((s, l) => s + l.cents, 0)).toBe(550_000 - 130_500);
    // Bathroom carries the most labor (19 mid hours of 41.5)
    expect(labor.find((l) => l.group_key === "bath")!.cents).toBe(Math.max(...labor.map((l) => l.cents)));
  });

  it("refuses a fixed price below the materials total", () => {
    expect(() => allocateFixedPrice(BASE, 8500, 100_000)).toThrow(/below the materials/);
  });

  it("with no hours anywhere, puts the labor share on one line", () => {
    const noHours: PreparedScope = { ...BASE, tasks: [task({ id: "x", group_key: "room1", materials_cents: 1000 })] };
    const lines = allocateFixedPrice(noHours, 8500, 50_000);
    expect(lines).toEqual([
      { group_key: "room1", label: "Room 1", kind: "labor", cents: 49_000 },
      { group_key: "room1", label: "Room 1", kind: "materials", cents: 1000 },
    ]);
  });
});
