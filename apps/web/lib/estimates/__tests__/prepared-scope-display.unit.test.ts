import { describe, it, expect } from "vitest";
import type { PreparedScope, PreparedTask } from "@ai-fsm/domain";
import { hoursSourceLabel, kindLabel, quantityLabel, tmRangeLabel, workAreaFlags, workAreaRows } from "../prepared-scope-display";

describe("prepared scope display", () => {
  it("labels measured, assumed, counted and unknown quantities", () => {
    expect(quantityLabel({ key: "ceiling_sqft", value: 96, unit: "sqft", basis: "measured" })).toBe("96 sq ft ceiling · measured");
    expect(quantityLabel({ key: "baseboard_lf", value: 35.333, unit: "lf", basis: "assumed" })).toBe("35.3 LF baseboard · assumed");
    expect(quantityLabel({ key: "count", value: 3, unit: "each", basis: "measured" })).toBe("3 · measured");
    expect(quantityLabel({ key: "count", value: 2, unit: "lf", basis: "measured" })).toBe("2 LF · measured");
    expect(quantityLabel({ key: "net_wall_sqft", value: null, unit: "sqft", basis: "unknown" })).toBe("walls unknown · needs a height");
    expect(quantityLabel({ key: "net_wall_sqft", value: 243, unit: "sqft", basis: "override" })).toBe("243 sq ft walls · your override");
  });

  it("names hour sources and task kinds in plain words", () => {
    expect(hoursSourceLabel("ai_allowance")).toBe("AI allowance");
    expect(hoursSourceLabel(null)).toBe("no hours yet");
    expect(kindLabel("suggested")).toBe("AI suggestion");
  });

  it("states the reference T&M range", () => {
    const summary = { groups: [], hours_low: 32, hours_high: 51, materials_cents: 130_500, tasks_without_hours: 0, tasks_without_materials_price: 0, unconfirmed_suggestions: 0 };
    expect(tmRangeLabel(summary, 8500)).toBe("$4,025–$5,640");
  });
});

function task(t: Partial<PreparedTask> & Pick<PreparedTask, "id" | "group_key">): PreparedTask {
  return {
    room_id: null, description: t.id, kind: "requested", confirmed: true, quantity_key: null, count: null, quantity: null,
    hours_low: null, hours_high: null, hours_source: null, materials_cents: null, ...t,
  };
}

const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v", assessment_id: "a", assessment_updated_at: null },
  groups: [{ key: "room1", label: "Room 1" }, { key: "bath", label: "Bathroom" }, { key: "empty", label: "Nothing here" }],
  tasks: [
    task({ id: "t1", group_key: "room1", hours_low: 4, hours_high: 7, materials_cents: 8500 }),
    task({ id: "t2", group_key: "bath", hours_low: 10, hours_high: 16, materials_cents: 50000 }),
    task({ id: "t3", group_key: "bath", hours_low: 9, hours_high: 13, materials_cents: 25000 }),
    task({ id: "t4", group_key: "bath", hours_low: null, hours_high: null, materials_cents: null }),
    task({ id: "t5", group_key: "bath", kind: "suggested", confirmed: false, hours_low: 2, hours_high: 3, materials_cents: 9000 }),
  ],
  questions: [
    { id: "q1", task_ids: ["t2"], text: "Subfloor?", answer: null },
    { id: "q2", task_ids: ["t1"], text: "Color?", answer: "White" },
  ],
  alternatives: [],
  exclusions: [],
};

describe("workAreaRows (TASK-185)", () => {
  it("gives one row per work area at midpoint hours, skipping empty areas and excluded tasks", () => {
    const table = workAreaRows(SCOPE, 8500);
    expect(table.rows.map((r) => r.key)).toEqual(["room1", "bath"]);
    const [room1, bath] = table.rows;
    // 5.5 h x $85 + $85
    expect(room1).toMatchObject({ labor_cents: 46750, materials_cents: 8500, total_cents: 55250, task_count: 1, included_count: 1, open_questions: 0 });
    // 19–29 h → 24 h x $85 + $750; the suggestion is out of the price
    expect(bath).toMatchObject({ hours_low: 19, hours_high: 29, labor_cents: 204000, materials_cents: 75000, task_count: 4, included_count: 3 });
    expect(bath).toMatchObject({ open_questions: 1, missing_hours: 1, missing_materials: 1 });
    expect(table.total_cents).toBe(55250 + 279000);
    expect(workAreaFlags(bath)).toBe("1 open question · 1 without hours · 1 not priced");
    expect(workAreaFlags(room1)).toBe("");
  });

  it("uses the fixed price allocation so rows add up to the price", () => {
    const fixed = { ...SCOPE, pricing: { mode: "fixed" as const, fixed_price_cents: 400000, expected_hours: null, overhead_cents: 0, reserve_pct: 0 } };
    const table = workAreaRows(fixed, 8500);
    expect(table.total_cents).toBe(400000);
    expect(table.materials_cents).toBe(83500);
  });

  it("falls back to T&M rows when the fixed price is below materials", () => {
    const low = { ...SCOPE, pricing: { mode: "fixed" as const, fixed_price_cents: 1000, expected_hours: null, overhead_cents: 0, reserve_pct: 0 } };
    expect(workAreaRows(low, 8500).rows[0].labor_cents).toBe(46750);
  });
});
