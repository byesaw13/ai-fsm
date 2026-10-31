import { describe, it, expect } from "vitest";
import {
  bindQuantities,
  parsePreparedScope,
  pickStartingHours,
  wallPaintHours,
  wallHeightTimeFactor,
  trimPaintHours,
  materialLineCents,
  materialListStale,
  summarizePreparedScope,
  type PreparedScope,
  type PreparedTask,
} from "../prepared-scope";
import type { AssessmentRoom } from "../assessment-summary";

// The owner's four-room walkthrough (TASK-179 reference scenario).
const ROOMS: AssessmentRoom[] = [
  { id: "r1", name: "Room 1", length_ft: 10, width_ft: 10, height_ft: null, notes: "", door_count: 1, window_count: 2 },
  { id: "r2", name: "Room 2", length_ft: null, width_ft: null, height_ft: null, notes: "" },
  { id: "r3", name: "Room 3", length_ft: null, width_ft: null, height_ft: null, notes: "" },
  {
    id: "r4",
    name: "Bathroom",
    length_ft: 12,
    width_ft: 8,
    height_ft: null,
    notes: "",
    door_count: 1,
    window_count: 1,
    openings: [{ label: "Closet door", width_in: 20 }],
  },
];

function task(t: Partial<PreparedTask> & Pick<PreparedTask, "id" | "room_id" | "description" | "group_key">): PreparedTask {
  return {
    kind: "requested",
    confirmed: true,
    quantity_key: null,
    count: null,
    quantity: null,
    hours_low: null,
    hours_high: null,
    hours_source: null,
    materials_cents: null,
    ...t,
  };
}

// Every requested action, each with its room. Hours/materials sit on one task per
// group so the group totals match the owner's demonstration figures.
const TASKS: PreparedTask[] = [
  task({ id: "t1", room_id: "r1", group_key: "room1", description: "Patch picture-hanger pinholes", hours_low: 5, hours_high: 8, hours_source: "owner", materials_cents: 8500 }),
  task({ id: "t2", room_id: "r1", group_key: "room1", description: "Replace missing baseboard", quantity_key: "count", count: 2, count_unit: "lf" }),
  task({ id: "t3", room_id: "r1", group_key: "room1", description: "Paint ceiling", quantity_key: "ceiling_sqft" }),
  task({ id: "t4", room_id: "r1", group_key: "room1", description: "Install missing faceplates", quantity_key: "count", count: 3 }),
  task({ id: "t5", room_id: "r2", group_key: "room2", description: "Patch 6 in hole, prep, blend paint", hours_low: 3, hours_high: 5, hours_source: "owner", materials_cents: 4000 }),
  task({ id: "t6", room_id: "r3", group_key: "room3", description: "Replace 2 can lights with LED retrofits", quantity_key: "count", count: 2, hours_low: 3, hours_high: 5, hours_source: "owner", materials_cents: 19000 }),
  task({ id: "t7", room_id: "r3", group_key: "room3", description: "Replace ceiling fan", quantity_key: "count", count: 1 }),
  task({ id: "t8", room_id: "r4", group_key: "bath", description: "Replace toilet, vanity, sink and faucet", hours_low: 15, hours_high: 23, hours_source: "owner", materials_cents: 75000 }),
  task({ id: "t9", room_id: "r4", group_key: "bath", description: "Reseal shower" }),
  task({ id: "t10", room_id: "r4", group_key: "bath", description: "Paint walls", quantity_key: "net_wall_sqft" }),
  task({ id: "t11", room_id: "r4", group_key: "bath", description: "Paint ceiling", quantity_key: "ceiling_sqft" }),
  task({ id: "t12", room_id: "r4", group_key: "bath", description: "Replace baseboard", quantity_key: "baseboard_lf" }),
  task({ id: "t13", room_id: "r4", group_key: "bath_floor", description: "Sheet vinyl floor", quantity_key: "floor_sqft", hours_low: 6, hours_high: 10, hours_source: "owner", materials_cents: 24000 }),
];

const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: "a1", assessment_updated_at: null },
  groups: [
    { key: "room1", label: "Room 1 repairs, ceiling, baseboard and plates" },
    { key: "room2", label: "Room 2 drywall repair and paint blending" },
    { key: "room3", label: "Room 3 LED retrofits and fan" },
    { key: "bath", label: "Bathroom fixtures, paint, trim and reseal" },
    { key: "bath_floor", label: "Bathroom sheet vinyl floor" },
  ],
  tasks: bindQuantities(TASKS, ROOMS),
  questions: [],
  alternatives: [],
  exclusions: [],
};

describe("bindQuantities", () => {
  const bound = new Map(SCOPE.tasks.map((t) => [t.id, t]));

  it("attaches measured areas to the task they drive", () => {
    expect(bound.get("t3")?.quantity).toEqual({ key: "ceiling_sqft", value: 100, unit: "sqft", basis: "measured" });
    expect(bound.get("t11")?.quantity).toEqual({ key: "ceiling_sqft", value: 96, unit: "sqft", basis: "measured" });
    expect(bound.get("t13")?.quantity).toEqual({ key: "floor_sqft", value: 96, unit: "sqft", basis: "measured" });
  });

  it("uses the counted openings for baseboard", () => {
    const q = bound.get("t12")?.quantity;
    expect(q?.unit).toBe("lf");
    expect(q?.basis).toBe("assumed");
    expect(q?.value).toBeCloseTo(40 - 3 - 20 / 12, 5);
  });

  it("keeps bathroom walls unknown without a height, never zero", () => {
    expect(bound.get("t10")?.quantity).toEqual({ key: "net_wall_sqft", value: null, unit: "sqft", basis: "unknown" });
  });

  it("records observed counts and lengths as measured, in their own unit", () => {
    expect(bound.get("t4")?.quantity).toEqual({ key: "count", value: 3, unit: "each", basis: "measured" });
    expect(bound.get("t2")?.quantity).toEqual({ key: "count", value: 2, unit: "lf", basis: "measured" });
  });

  it("leaves tasks that need no measurement alone, and does not need room size for them", () => {
    expect(bound.get("t9")?.quantity).toBeNull();
    expect(bound.get("t7")?.quantity?.value).toBe(1); // Room 3 has no dimensions; a fan count still works
  });

  it("an area task in an unknown room stays unknown", () => {
    const [t] = bindQuantities([task({ id: "x", room_id: "missing", group_key: "g", description: "Paint", quantity_key: "floor_sqft" })], ROOMS);
    expect(t.quantity).toEqual({ key: "floor_sqft", value: null, unit: "sqft", basis: "unknown" });
  });
});

describe("summarizePreparedScope", () => {
  it("reference fixture totals 32–51 hours and $1,305 materials", () => {
    const s = summarizePreparedScope(SCOPE);
    expect(s.hours_low).toBe(32);
    expect(s.hours_high).toBe(51);
    expect(s.materials_cents).toBe(130_500);
    expect(s.groups.map((g) => [g.key, g.hours_low, g.hours_high, g.materials_cents])).toEqual([
      ["room1", 5, 8, 8500],
      ["room2", 3, 5, 4000],
      ["room3", 3, 5, 19000],
      ["bath", 15, 23, 75000],
      ["bath_floor", 6, 10, 24000],
    ]);
  });

  it("counts tasks still missing hours or a materials price instead of treating them as zero", () => {
    const s = summarizePreparedScope(SCOPE);
    expect(s.tasks_without_hours).toBe(8);
    expect(s.tasks_without_materials_price).toBe(8);
  });

  it("leaves unconfirmed AI suggestions out of the totals", () => {
    const withSuggestion: PreparedScope = {
      ...SCOPE,
      tasks: [
        ...SCOPE.tasks,
        task({ id: "s1", room_id: "r2", group_key: "room2", description: "Repaint whole wall", kind: "suggested", confirmed: false, hours_low: 2, hours_high: 3, materials_cents: 5000 }),
      ],
    };
    const s = summarizePreparedScope(withSuggestion);
    expect(s.hours_low).toBe(32);
    expect(s.materials_cents).toBe(130_500);
    expect(s.unconfirmed_suggestions).toBe(1);
  });
});

describe("pickStartingHours", () => {
  it("prefers the price book, then a production rate, then an AI allowance", () => {
    expect(pickStartingHours({ price_book: { low: 1, high: 2 }, production_rate: { low: 3, high: 4 }, ai_allowance: { low: 5, high: 6 } })).toEqual({ low: 1, high: 2, source: "price_book" });
    expect(pickStartingHours({ price_book: null, production_rate: { low: 3, high: 4 }, ai_allowance: { low: 5, high: 6 } })).toEqual({ low: 3, high: 4, source: "production_rate" });
    expect(pickStartingHours({ ai_allowance: { low: 5, high: 6 } })).toEqual({ low: 5, high: 6, source: "ai_allowance" });
  });

  it("skips a candidate with no usable range, and returns null when nothing is usable", () => {
    expect(pickStartingHours({ price_book: { low: null, high: null }, ai_allowance: { low: 1, high: 1.5 } })?.source).toBe("ai_allowance");
    expect(pickStartingHours({})).toBeNull();
  });

  it("fills a one-sided range from the side that exists and keeps low ≤ high", () => {
    expect(pickStartingHours({ price_book: { low: null, high: 2 } })).toEqual({ low: 2, high: 2, source: "price_book" });
    expect(pickStartingHours({ price_book: { low: 3, high: 1 } })).toEqual({ low: 1, high: 3, source: "price_book" });
  });
});

describe("parsePreparedScope", () => {
  it("round-trips the reference scope through JSON", () => {
    expect(parsePreparedScope(JSON.parse(JSON.stringify(SCOPE)))).toEqual(SCOPE);
  });

  it("rejects missing, wrong-version or malformed scopes", () => {
    expect(parsePreparedScope(null)).toBeNull();
    expect(parsePreparedScope({ ...SCOPE, version: 2 })).toBeNull();
    expect(parsePreparedScope({ ...SCOPE, tasks: [{ id: "x" }] })).toBeNull();
  });
});

describe("wallHeightTimeFactor (TASK-228, Craftsman, owner-approved 2026-10-31)", () => {
  it("is 1 up to 9 ft, then rises by height band", () => {
    expect([8, 9, 9.5, 13, 13.5, 17, 18, 19, 20, 21].map((h) => wallHeightTimeFactor(h).factor)).toEqual([
      1, 1, 1.23, 1.23, 1.46, 1.46, 1.69, 1.69, 1.92, 1.92,
    ]);
  });

  it("stays at the top band above 21 ft and says the staging needs its own price", () => {
    expect(wallHeightTimeFactor(24)).toMatchObject({ factor: 1.92, band: "19–21 ft", aboveTable: true });
  });

  it("is 1 when the height is unknown", () => {
    expect(wallHeightTimeFactor(null)).toMatchObject({ factor: 1, band: null });
  });
});

describe("wallPaintHours (TASK-184)", () => {
  const RATE = { sqft_per_day: 400 };

  it("is the area over the daily pace, plus or minus 15%", () => {
    // 466 sq ft at 50 sq ft/h = 9.32 h
    expect(wallPaintHours(466, 8, RATE)).toEqual({ low: 8, high: 10.75 });
  });

  it("takes longer on taller walls, by the Craftsman height factor (TASK-228)", () => {
    // 214 sq ft at 400 sq ft/day = 4.28 h before height
    expect(wallPaintHours(214, 9, RATE)).toEqual({ low: 3.75, high: 5 });
    expect(wallPaintHours(214, 10, RATE)).toEqual({ low: 4.5, high: 6 }); // ×1.23
    expect(wallPaintHours(214, 18, RATE)).toEqual({ low: 6.25, high: 8.25 }); // ×1.69
  });

  it("uses the hours-per-day setting (TASK-193)", () => {
    // 466 sq ft at 400/day over a 10-hour day = 11.65 h
    expect(wallPaintHours(466, 8, { ...RATE, hours_per_day: 10 })).toEqual({ low: 10, high: 13.5 });
  });

  it("is null without an area or a pace", () => {
    expect(wallPaintHours(null, 8, RATE)).toBeNull();
    expect(wallPaintHours(0, 8, RATE)).toBeNull();
    expect(wallPaintHours(300, 8, null)).toBeNull();
  });
});

describe("itemized materials (TASK-187)", () => {
  const line = (id: string, quantity: number, unit_cost_cents: number | null) => ({
    id, name: id, quantity, unit: "each", unit_cost_cents, source: "ai_estimate" as const, price_book_id: null, notes: "",
  });
  const bathTasks = SCOPE.tasks.filter((t) => t.group_key === "bath").map((t) => t.id);
  const itemized: PreparedScope = {
    ...SCOPE,
    materials: {
      bath: { task_ids: bathTasks, lines: [line("toilet", 1, 28900), line("caulk", 2, 899), line("vanity", 1, null)], customer_supplied: [], assumptions: [] },
    },
  };

  it("a listed group's materials come from its lines, not the task allowance", () => {
    const s = summarizePreparedScope(itemized);
    const bath = s.groups.find((g) => g.key === "bath")!;
    expect(bath.materials_cents).toBe(28900 + 1798);
    // Other groups keep their allowances
    expect(s.groups.find((g) => g.key === "room1")!.materials_cents).toBe(8500);
    expect(s.material_lines_without_price).toBe(1);
    // Bath tasks without an allowance no longer count as unpriced
    expect(s.tasks_without_materials_price).toBe(summarizePreparedScope(SCOPE).tasks_without_materials_price - 4);
  });

  it("prices a line by quantity, and says when the group's tasks changed since listing", () => {
    expect(materialLineCents(line("caulk", 2, 899))).toBe(1798);
    expect(materialLineCents(line("vanity", 1, null))).toBeNull();
    expect(materialListStale(itemized, "bath")).toBe(false);
    const changed = { ...itemized, tasks: itemized.tasks.map((t) => (t.id === "t9" ? { ...t, confirmed: false } : t)) };
    expect(materialListStale(changed, "bath")).toBe(true);
    expect(materialListStale(itemized, "room1")).toBe(false);
  });

  it("survives a save and readback", () => {
    expect(parsePreparedScope(JSON.parse(JSON.stringify(itemized)))?.materials?.bath.lines).toHaveLength(3);
  });
});

describe("trimPaintHours (TASK-217)", () => {
  it("is the length over the daily pace, plus or minus 15%", () => {
    // 40 ft at 120 ft a day = 2.67 h
    expect(trimPaintHours(40, { linear_ft_per_day: 120 })).toEqual({ low: 2.25, high: 3 });
  });

  it("is null without a length or a pace", () => {
    expect(trimPaintHours(null, { linear_ft_per_day: 120 })).toBeNull();
    expect(trimPaintHours(40, null)).toBeNull();
  });

  it("keeps the trim method on readback", () => {
    const t = { ...SCOPE.tasks[0], method: "trim_paint" as const, estimate_notes: [{ kind: "limitation" as const, text: "uncalibrated" }] };
    expect(parsePreparedScope({ ...SCOPE, tasks: [t] })?.tasks[0]).toMatchObject({ method: "trim_paint", estimate_notes: [{ kind: "limitation" }] });
  });
});
