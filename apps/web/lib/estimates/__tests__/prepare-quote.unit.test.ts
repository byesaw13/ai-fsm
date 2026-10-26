import { describe, it, expect } from "vitest";
import { buildAssessmentSummary, type AssessmentRoom } from "@ai-fsm/domain";
import {
  applyScopeEdits,
  buildPreparationPrompt,
  buildProposalNotes,
  preparedScopeInternalNote,
  preparedScopeToLineItems,
  toPreparedScope,
  type PreparationOutput,
  type PriceBookHours,
} from "../prepare-quote";

// The owner's four-room walkthrough (TASK-179 reference scenario).
const ROOMS: AssessmentRoom[] = [
  { id: "r1", name: "Room 1", length_ft: 10, width_ft: 10, height_ft: null, notes: "pinholes, 2 ft baseboard missing, paint ceiling, 3 faceplates missing", door_count: 1, window_count: 2 },
  { id: "r2", name: "Room 2", length_ft: null, width_ft: null, height_ft: null, notes: "6 in hole lower left, patch prep paint match, no matching paint on site" },
  { id: "r3", name: "Room 3", length_ft: null, width_ft: null, height_ft: null, notes: "replace 2 can lights with LED, replace ceiling fan" },
  { id: "r4", name: "Bathroom", length_ft: 12, width_ft: 8, height_ft: null, notes: "toilet, vanity, sink, faucet; vinyl floor; reseal shower; paint; baseboard; trim", door_count: 1, window_count: 1, openings: [{ label: "Closet door", width_in: 20 }] },
];

const SUMMARY = buildAssessmentSummary({
  visitId: "v1",
  assessmentId: "a1",
  rooms: ROOMS,
  scopeNotes: "Dovetails supplies toilet, vanity, faucet and fan. Show sheet vinyl and vinyl plank. Bathroom ceiling included. Possible subfloor damage.",
});

const SOURCE = { visitId: "v1", assessmentUpdatedAt: "2026-10-23 12:00:00+00" };

const PRICE_BOOK: PriceBookHours[] = [
  { code: "3002", name: "Ceiling fan replace", labor_hours_low: 1, labor_hours_typical: 1.5, labor_hours_high: 2 },
  { code: "9099", name: "Custom", labor_hours_low: null, labor_hours_typical: null, labor_hours_high: null },
];

type RawTask = PreparationOutput["tasks"][number];
function raw(t: Partial<RawTask> & Pick<RawTask, "description" | "group_key">): RawTask {
  return {
    room_id: null,
    kind: "requested",
    quantity_key: null,
    count: null,
    count_unit: null,
    hours_low: null,
    hours_high: null,
    materials_cents: null,
    customer_supplied: false,
    is_alternative: false,
    price_book_code: null,
    work_type: "other",
    paint_grade: null,
    ...t,
  };
}

// Model output for the walkthrough, with the owner's demonstration hours on one
// task per group so group totals equal the fixture (32–51 h, $1,305).
const OUTPUT: PreparationOutput = {
  groups: [
    { key: "room1", label: "Room 1 repairs, ceiling, baseboard and plates" },
    { key: "room2", label: "Room 2 drywall repair and paint blending" },
    { key: "room3", label: "Room 3 LED retrofits and fan" },
    { key: "bath", label: "Bathroom fixtures, paint, trim and reseal" },
    { key: "bath_floor", label: "Bathroom sheet vinyl floor" },
  ],
  tasks: [
    raw({ room_id: "r1", group_key: "room1", description: "Patch picture-hanger pinholes", hours_low: 5, hours_high: 8, materials_cents: 8500 }),
    raw({ room_id: "r1", group_key: "room1", description: "Replace missing baseboard", quantity_key: "count", count: 2, count_unit: "lf", materials_cents: 0 }),
    raw({ room_id: "r1", group_key: "room1", description: "Paint ceiling", quantity_key: "ceiling_sqft", materials_cents: 0 }),
    raw({ room_id: "r1", group_key: "room1", description: "Install missing faceplates", quantity_key: "count", count: 3, count_unit: "each", materials_cents: 0 }),
    raw({ room_id: "r2", group_key: "room2", description: "Patch 6 in hole, prep and blend paint", hours_low: 3, hours_high: 5, materials_cents: 4000 }),
    raw({ room_id: "r3", group_key: "room3", description: "Replace 2 can lights with LED retrofits", quantity_key: "count", count: 2, count_unit: "each", hours_low: 3, hours_high: 5, materials_cents: 19000 }),
    raw({ room_id: "r3", group_key: "room3", description: "Replace ceiling fan", quantity_key: "count", count: 1, count_unit: "each", materials_cents: 0 }),
    raw({ room_id: "r4", group_key: "bath", description: "Replace toilet, vanity, sink and faucet", hours_low: 15, hours_high: 23, materials_cents: 75000 }),
    raw({ room_id: "r4", group_key: "bath", description: "Reseal shower", materials_cents: 0 }),
    raw({ room_id: "r4", group_key: "bath", description: "Paint walls", quantity_key: "net_wall_sqft", materials_cents: 0 }),
    raw({ room_id: "r4", group_key: "bath", description: "Paint ceiling", quantity_key: "ceiling_sqft", materials_cents: 0 }),
    raw({ room_id: "r4", group_key: "bath", description: "Replace baseboard", quantity_key: "baseboard_lf", materials_cents: 0 }),
    raw({ room_id: "r4", group_key: "bath", description: "Prep and paint all trim", materials_cents: 0 }),
    raw({ room_id: "r4", group_key: "bath_floor", description: "Install sheet vinyl floor", quantity_key: "floor_sqft", hours_low: 6, hours_high: 10, materials_cents: 24000 }),
    raw({ room_id: "r4", group_key: "bath_floor", description: "Remove existing vinyl floor", materials_cents: 0 }),
  ],
  questions: [{ text: "Repair any subfloor damage found, or exclude it?", task_indexes: [13, 14] }],
  alternatives: [{ label: "Vinyl plank instead of sheet vinyl", task_indexes: [13], note: null }],
  exclusions: ["Concealed subfloor damage"],
};

const TEST_RATE_CENTS = 8500; // test-only rate from the owner's demonstration

describe("toPreparedScope", () => {
  const scope = toPreparedScope(OUTPUT, SUMMARY, [], SOURCE);

  it("keeps all 15 requested tasks, each in its room", () => {
    expect(scope.tasks).toHaveLength(15);
    expect(scope.tasks.filter((t) => t.room_id === "r4")).toHaveLength(8);
    expect(scope.tasks.every((t) => t.room_id !== null)).toBe(true);
  });

  it("binds measured quantities in code and keeps unknowns unknown", () => {
    const byDesc = (d: string, room: string) => scope.tasks.find((t) => t.description === d && t.room_id === room)!;
    expect(byDesc("Paint ceiling", "r1").quantity).toMatchObject({ value: 100, basis: "measured" });
    expect(byDesc("Paint ceiling", "r4").quantity).toMatchObject({ value: 96, basis: "measured" });
    expect(byDesc("Install sheet vinyl floor", "r4").quantity).toMatchObject({ value: 96, unit: "sqft" });
    expect(byDesc("Replace baseboard", "r4").quantity?.value).toBeCloseTo(35.33, 1);
    expect(byDesc("Paint walls", "r4").quantity).toMatchObject({ value: null, basis: "unknown" });
    expect(byDesc("Replace missing baseboard", "r1").quantity).toMatchObject({ value: 2, unit: "lf" });
  });

  it("records the source visit and assessment revision", () => {
    expect(scope.source).toEqual({ visit_id: "v1", assessment_id: "a1", assessment_updated_at: "2026-10-23 12:00:00+00" });
  });

  it("ties questions and alternatives to tasks by id", () => {
    expect(scope.questions[0]).toMatchObject({ id: "q1", task_ids: ["t14", "t15"], answer: null });
    expect(scope.alternatives[0].task_ids).toEqual(["t14"]);
    expect(scope.exclusions).toEqual(["Concealed subfloor damage"]);
  });

  it("starts AI suggestions unconfirmed", () => {
    const s = toPreparedScope(
      { ...OUTPUT, tasks: [raw({ room_id: "r2", group_key: "room2", description: "Repaint whole wall", kind: "suggested" })] },
      SUMMARY, [], SOURCE,
    );
    expect(s.tasks[0]).toMatchObject({ kind: "suggested", confirmed: false });
  });

  it("charges for one side of an option: the alternative starts unconfirmed and stays out of totals", () => {
    const s = toPreparedScope(
      {
        ...OUTPUT,
        tasks: [
          raw({ room_id: "r4", group_key: "bath_floor", description: "Sheet vinyl", quantity_key: "floor_sqft", hours_low: 6, hours_high: 10, materials_cents: 24000 }),
          raw({ room_id: "r4", group_key: "bath_floor", description: "Vinyl plank", quantity_key: "floor_sqft", hours_low: 8, hours_high: 12, materials_cents: 40000, is_alternative: true }),
        ],
      },
      SUMMARY, [], SOURCE,
    );
    expect(s.tasks.map((t) => [t.kind, t.confirmed])).toEqual([["requested", true], ["requested", false]]);
    const { lineItems } = preparedScopeToLineItems(s, TEST_RATE_CENTS);
    expect(lineItems.map((l) => [l.quantity, l.unit_price_cents])).toEqual([[8, 8500], [1, 24000]]);
  });

  it("prefers price-book hours over the model's allowance and labels the source", () => {
    const s = toPreparedScope(
      { ...OUTPUT, tasks: [raw({ room_id: "r3", group_key: "room3", description: "Replace ceiling fan", price_book_code: "3002", hours_low: 4, hours_high: 6 })] },
      SUMMARY, PRICE_BOOK, SOURCE,
    );
    expect(s.tasks[0]).toMatchObject({ hours_low: 1, hours_high: 2, hours_source: "price_book", price_book_code: "3002" });
  });

  it("falls back to a labeled AI allowance when the price book has no hours", () => {
    const s = toPreparedScope(
      { ...OUTPUT, tasks: [raw({ room_id: "r1", group_key: "room1", description: "Custom work", price_book_code: "9099", hours_low: 2, hours_high: 3 })] },
      SUMMARY, PRICE_BOOK, SOURCE,
    );
    expect(s.tasks[0]).toMatchObject({ hours_low: 2, hours_high: 3, hours_source: "ai_allowance" });
  });

  it("prices customer-supplied items at zero and leaves unpriced products null", () => {
    const s = toPreparedScope(
      {
        ...OUTPUT,
        tasks: [
          raw({ room_id: "r4", group_key: "bath", description: "Install customer's vanity", customer_supplied: true, materials_cents: 50000 }),
          raw({ room_id: "r4", group_key: "bath", description: "Faucet (model not chosen)", materials_cents: null }),
        ],
      },
      SUMMARY, [], SOURCE,
    );
    expect(s.tasks.map((t) => t.materials_cents)).toEqual([0, null]);
  });

  it("drops room ids the assessment does not have, and adds a group for an unknown key", () => {
    const s = toPreparedScope(
      { ...OUTPUT, groups: [], tasks: [raw({ room_id: "nope", group_key: "Hallway Work", description: "Touch up" })] },
      SUMMARY, [], SOURCE,
    );
    expect(s.tasks[0].room_id).toBeNull();
    expect(s.groups).toEqual([{ key: "hallway_work", label: "hallway work" }]);
  });
});

describe("preparedScopeToLineItems", () => {
  const scope = toPreparedScope(OUTPUT, SUMMARY, [], SOURCE);
  const { lineItems, groupKeys } = preparedScopeToLineItems(scope, TEST_RATE_CENTS);

  it("makes a labor line at mid hours and a materials line per group", () => {
    expect(lineItems[0]).toMatchObject({
      description: "Room 1 repairs, ceiling, baseboard and plates — labor, est. 5–8 h",
      quantity: 6.5,
      unit_price_cents: 8500,
      line_item_type: "labor",
    });
    expect(lineItems[1]).toMatchObject({ description: "Room 1 repairs, ceiling, baseboard and plates — materials allowance", quantity: 1, unit_price_cents: 8500, line_item_type: "materials" });
    expect(lineItems).toHaveLength(10);
  });

  it("records the group of every line", () => {
    expect(groupKeys).toEqual(["room1", "room1", "room2", "room2", "room3", "room3", "bath", "bath", "bath_floor", "bath_floor"]);
  });

  it("adds no labor line for a group still missing hours", () => {
    const scope = toPreparedScope(OUTPUT, SUMMARY, [], SOURCE);
    const empty = { ...scope, tasks: scope.tasks.map((t) => ({ ...t, hours_low: null, hours_high: null, materials_cents: null })) };
    expect(preparedScopeToLineItems(empty, TEST_RATE_CENTS)).toEqual({ lineItems: [], groupKeys: [] });
  });
});

describe("preparedScopeInternalNote", () => {
  it("states the reference T&M range: 32–51 h, $1,305 materials, $4,025–$5,640 at $85/h", () => {
    const note = preparedScopeInternalNote(toPreparedScope(OUTPUT, SUMMARY, [], SOURCE), TEST_RATE_CENTS);
    expect(note).toContain("T&M estimate $4,025–$5,640: 32–51 h at $85/h plus $1,305 materials.");
    expect(note).toContain("1 open question(s).");
  });
});

describe("buildPreparationPrompt", () => {
  const prompt = buildPreparationPrompt(SUMMARY, PRICE_BOOK);

  it("gives the model room ids, counted openings and measured quantities", () => {
    expect(prompt).toContain("room_id r4: Bathroom");
    expect(prompt).toContain("openings: 1 door(s), 1 window(s), Closet door 20 in wide");
    expect(prompt).toContain("Floor / ceiling 96 sq ft");
    expect(prompt).toContain("room_id r2: Room 2\n  measured: no dimensions");
  });

  it("includes the owner's notes and only price-book codes that carry hours", () => {
    expect(prompt).toContain("Possible subfloor damage.");
    expect(prompt).toContain("3002 Ceiling fan replace");
    expect(prompt).not.toContain("9099");
  });
});

describe("applyScopeEdits", () => {
  const stored = toPreparedScope(OUTPUT, SUMMARY, [], SOURCE);

  it("takes the owner's hours, materials, inclusion and answers, labeling changed hours as theirs", () => {
    const incoming = structuredClone(stored);
    incoming.tasks[0] = { ...incoming.tasks[0], hours_low: 6, hours_high: 9, materials_cents: 9000 };
    incoming.tasks[13] = { ...incoming.tasks[13], confirmed: false };
    incoming.questions[0] = { ...incoming.questions[0], answer: "  Exclude it  " };
    const merged = applyScopeEdits(stored, incoming);
    expect(merged.tasks[0]).toMatchObject({ hours_low: 6, hours_high: 9, hours_source: "owner", materials_cents: 9000 });
    expect(merged.tasks[13].confirmed).toBe(false);
    expect(merged.questions[0].answer).toBe("Exclude it");
  });

  it("keeps the hours source when hours did not change", () => {
    const merged = applyScopeEdits(stored, structuredClone(stored));
    expect(merged.tasks[0].hours_source).toBe("ai_allowance");
  });

  it("ignores edits to rooms, quantities, text, source and unknown tasks", () => {
    const incoming = structuredClone(stored);
    incoming.tasks[2] = { ...incoming.tasks[2], room_id: "r2", description: "Paint everything", quantity: { key: "ceiling_sqft", value: 9999, unit: "sqft", basis: "measured" } };
    incoming.tasks.push({ ...incoming.tasks[0], id: "t99", description: "Injected" });
    incoming.source = { visit_id: "other", assessment_id: null, assessment_updated_at: null };
    const merged = applyScopeEdits(stored, incoming);
    expect(merged.tasks[2]).toMatchObject({ room_id: "r1", description: "Paint ceiling", quantity: { value: 100 } });
    expect(merged.tasks).toHaveLength(15);
    expect(merged.source.visit_id).toBe("v1");
  });

  it("puts reversed hours back in order", () => {
    const incoming = structuredClone(stored);
    incoming.tasks[0] = { ...incoming.tasks[0], hours_low: 9, hours_high: 6 };
    expect(applyScopeEdits(stored, incoming).tasks[0]).toMatchObject({ hours_low: 6, hours_high: 9 });
  });
});

describe("fixed price lines (TASK-180)", () => {
  const base = toPreparedScope(OUTPUT, SUMMARY, [], SOURCE);
  const fixed = { ...base, pricing: { mode: "fixed" as const, fixed_price_cents: 550_000, expected_hours: 42, overhead_cents: 30_000, reserve_pct: 12 } };

  it("one labor and one materials line per group, summing exactly to the fixed price, no hours shown", () => {
    const { lineItems, groupKeys } = preparedScopeToLineItems(fixed, TEST_RATE_CENTS);
    expect(lineItems.reduce((s, l) => s + l.quantity * l.unit_price_cents, 0)).toBe(550_000);
    expect(lineItems.every((l) => l.quantity === 1 && !/\bh\b|hours/.test(l.description))).toBe(true);
    expect(lineItems.filter((l) => l.line_item_type === "materials").map((l) => l.unit_price_cents)).toEqual([8500, 4000, 19000, 75000, 24000]);
    expect(groupKeys).toHaveLength(lineItems.length);
  });

  it("a fixed quote without a price falls back to T&M lines", () => {
    const noPrice = { ...base, pricing: { ...fixed.pricing, fixed_price_cents: null } };
    expect(preparedScopeToLineItems(noPrice, TEST_RATE_CENTS).lineItems[0].description).toMatch(/labor, est\. 5–8 h/);
  });
});

describe("buildProposalNotes", () => {
  const scope = toPreparedScope(OUTPUT, SUMMARY, [], SOURCE);

  it("lists included work by group, options and the T&M range, without hours or cost", () => {
    const text = buildProposalNotes(scope, TEST_RATE_CENTS);
    expect(text).toMatch(/^What's included\n\nRoom 1 repairs, ceiling, baseboard and plates\n- Patch picture-hanger pinholes/);
    expect(text).toContain("Options (not included unless you choose them)\n- Vinyl plank instead of sheet vinyl");
    expect(text).toContain("Materials are allowances.");
    expect(text).toContain("Pricing: time and materials, estimated $4,025–$5,640.");
    expect(text).not.toMatch(/\d+(\.\d+)?\s*h\b|hours|\/h|margin|labor cost|remainder|reserve|overhead/i);
  });

  it("states the fixed price when the quote is fixed", () => {
    const text = buildProposalNotes({ ...scope, pricing: { mode: "fixed", fixed_price_cents: 550_000, expected_hours: null, overhead_cents: 0, reserve_pct: 0 } }, TEST_RATE_CENTS);
    expect(text).toContain("Pricing: fixed price of $5,500 for the work above.");
    expect(text).not.toContain("time and materials");
  });

  it("leaves out unchecked tasks from the included work", () => {
    const s = structuredClone(scope);
    s.tasks[0].confirmed = false;
    expect(buildProposalNotes(s, TEST_RATE_CENTS).split("Options")[0]).not.toContain("Patch picture-hanger pinholes");
  });
});

describe("applyScopeEdits pricing", () => {
  const stored = { ...toPreparedScope(OUTPUT, SUMMARY, [], SOURCE), proposal_notes: "What's included…" };

  it("takes the owner's pricing inputs and keeps the server's proposal text", () => {
    const incoming = { ...structuredClone(stored), proposal_notes: "tampered", pricing: { mode: "fixed" as const, fixed_price_cents: 550_000, expected_hours: 42, overhead_cents: 30_000, reserve_pct: 12 } };
    const merged = applyScopeEdits(stored, incoming);
    expect(merged.pricing).toEqual(incoming.pricing);
    expect(merged.proposal_notes).toBe("What's included…");
  });
});

describe("toPreparedScope — wall painting at the owner's pace (TASK-184)", () => {
  const BEDROOM: AssessmentRoom = { id: "b1", name: "Bedroom", length_ft: 16, width_ft: 17.5, height_ft: 8, notes: "", door_count: 2, window_count: 2 };
  const FOYER: AssessmentRoom = {
    id: "f1", name: "Foyer", length_ft: 18, width_ft: 10, height_ft: 18, notes: "", door_count: 1, window_count: 0,
    wall_lengths: [{ label: "Stair wall", length_ft: 13 }],
  };
  const summary = buildAssessmentSummary({ visitId: "v2", assessmentId: "a2", rooms: [BEDROOM, FOYER], scopeNotes: "High quality paint" });
  const priceBook: PriceBookHours[] = [{ code: "5020", name: "Paint room", labor_hours_low: 7, labor_hours_typical: 9, labor_hours_high: 11 }];
  const rate = { sqft_per_day: 400, tall_wall_modifier_pct: -0.15 };
  const output: PreparationOutput = {
    groups: [{ key: "bed", label: "Bedroom" }, { key: "foyer", label: "Foyer" }],
    tasks: [
      raw({ room_id: "b1", description: "Paint walls", group_key: "bed", quantity_key: "gross_wall_sqft", hours_low: 7, hours_high: 11, materials_cents: 25000, price_book_code: "5020", work_type: "wall_paint", paint_grade: "premium" }),
      raw({ room_id: "f1", description: "Paint stair wall", group_key: "foyer", quantity_key: "count", count: 13, count_unit: "lf", hours_low: 2, hours_high: 4, materials_cents: 6000, work_type: "wall_paint", paint_grade: "premium" }),
      raw({ room_id: "b1", description: "Patch hole", group_key: "bed", hours_low: 1, hours_high: 2, materials_cents: 1500 }),
    ],
    questions: [],
    alternatives: [],
    exclusions: [],
  };

  it("uses the net wall area, the pace (over the price book) and computed paint", () => {
    const scope = toPreparedScope(output, summary, priceBook, { ...SOURCE, wallPaintRate: rate });
    const [bed, foyer, patch] = scope.tasks;
    // 536 gross − 2 doors − 2 windows = 466 sq ft
    expect(bed.quantity).toMatchObject({ key: "net_wall_sqft", value: 466 });
    expect(bed).toMatchObject({ hours_low: 8, hours_high: 10.75, hours_source: "production_rate" });
    // 466 x 2 coats / 350 x 1.1 = 2.93 → 3 gal premium at $75
    expect(bed.materials_cents).toBe(22500);
    // The foyer's listed 13 ft wall at 18 ft, tall-wall pace
    expect(foyer.quantity).toMatchObject({ key: "net_wall_sqft", value: 214 });
    expect(foyer).toMatchObject({ hours_low: 4.25, hours_high: 5.75, hours_source: "production_rate", count: null });
    expect(foyer.materials_cents).toBe(15000);
    // Other work is untouched
    expect(patch).toMatchObject({ hours_low: 1, hours_high: 2, hours_source: "ai_allowance", materials_cents: 1500 });
  });

  it("falls back to the price book and the model's allowance without a pace", () => {
    const scope = toPreparedScope(output, summary, priceBook, SOURCE);
    expect(scope.tasks[0]).toMatchObject({ hours_low: 7, hours_high: 11, hours_source: "price_book" });
    // Paint is still computed from the area
    expect(scope.tasks[0].materials_cents).toBe(22500);
  });

  it("keeps a wall paint task on the model's quantity when the net area is unknown", () => {
    const uncounted = buildAssessmentSummary({ visitId: "v3", assessmentId: "a3", rooms: [{ ...BEDROOM, door_count: undefined }] });
    const scope = toPreparedScope({ ...output, tasks: [output.tasks[0]] }, uncounted, [], { ...SOURCE, wallPaintRate: rate });
    // Gross is known, so the pace still applies to it.
    expect(scope.tasks[0].quantity).toMatchObject({ key: "gross_wall_sqft", value: 536 });
    expect(scope.tasks[0].hours_source).toBe("production_rate");
  });
});
