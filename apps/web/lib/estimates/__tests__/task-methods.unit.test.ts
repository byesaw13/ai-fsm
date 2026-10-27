import { describe, it, expect } from "vitest";
import { buildAssessmentSummary, summarizePreparedScope, type AssessmentRoom, type PreparedTask } from "@ai-fsm/domain";
import {
  applyScopeEdits,
  buildProposalNotes,
  preparedScopeToLineItems,
  toPreparedScope,
  type PreparationOutput,
  type PriceBookHours,
} from "../prepare-quote";

// TASK-217 acceptance room: 400 sq ft of paintable walls, 100 sq ft of ceiling,
// 40 linear ft of baseboard, six nail holes.
const ROOM: AssessmentRoom = {
  id: "r1", name: "Bedroom", length_ft: 10, width_ft: 10, height_ft: 10, notes: "", door_count: 0, window_count: 0,
};
const SUMMARY = buildAssessmentSummary({ visitId: "v1", assessmentId: "a1", rooms: [ROOM] });

// The production price book rows these methods use.
const PRICE_BOOK: PriceBookHours[] = [
  { code: "1001", name: 'Drywall patch <=6"', labor_hours_low: 0.75, labor_hours_typical: 1, labor_hours_high: 1.5 },
  { code: "1004", name: "Drywall patch with texture match", labor_hours_low: 3.5, labor_hours_typical: 4.5, labor_hours_high: 6 },
  { code: "5003", name: "Trim/baseboard painting", labor_hours_low: 1, labor_hours_typical: 1.5, labor_hours_high: 2 },
  { code: "5008", name: 'Touch-up painting (patches <=6")', labor_hours_low: 0.5, labor_hours_typical: 0.75, labor_hours_high: 1 },
  { code: "5020", name: "Room painting – walls only", labor_hours_low: 7, labor_hours_typical: 9, labor_hours_high: 11 },
  { code: "5021", name: "Room painting – ceiling add-on", labor_hours_low: 2, labor_hours_typical: 2.5, labor_hours_high: 3 },
  { code: "5022", name: "Room painting – walls + ceiling + trim", labor_hours_low: 10, labor_hours_typical: 12, labor_hours_high: 15 },
];
const RATES = {
  wallPaintRate: { sqft_per_day: 400, tall_wall_modifier_pct: -0.15 },
  trimPaintRate: { linear_ft_per_day: 120 },
};
const SOURCE = { visitId: "v1", assessmentUpdatedAt: null, ...RATES };

type RawTask = PreparationOutput["tasks"][number];
function raw(t: Partial<RawTask> & Pick<RawTask, "description" | "work_type">): RawTask {
  return {
    room_id: "r1", kind: "requested", group_key: "bedroom", quantity_key: null, count: null, count_unit: null,
    hours_low: null, hours_high: null, materials_cents: null, customer_supplied: false, is_alternative: false,
    price_book_code: null, paint_grade: null, repair_class: null, extra_visit: false, ...t,
  };
}

const ACCEPTANCE: RawTask[] = [
  raw({ description: "Set up, protect floors and clean up", work_type: "generic", room_id: null, hours_low: 1, hours_high: 2, materials_cents: 3000 }),
  // The model guessed hours and a whole-room code for the walls; the method must ignore both.
  raw({ description: "Paint walls", work_type: "wall_paint", quantity_key: "net_wall_sqft", hours_low: 3, hours_high: 4, materials_cents: 9000, price_book_code: "5020", paint_grade: "standard" }),
  raw({ description: "Paint ceiling", work_type: "ceiling_paint", quantity_key: "ceiling_sqft", hours_low: 1, hours_high: 1.5, materials_cents: 4000, paint_grade: "standard" }),
  raw({ description: "Paint baseboard", work_type: "trim_paint", quantity_key: "baseboard_lf", hours_low: 1, hours_high: 2, materials_cents: 2000, paint_grade: "standard" }),
  raw({ description: "Fill six nail holes", work_type: "drywall_prep", quantity_key: "count", count: 6, count_unit: "each", hours_low: 0.5, hours_high: 1, materials_cents: 500, repair_class: "ordinary_fill" }),
];

function output(tasks: RawTask[]): PreparationOutput {
  return { groups: [{ key: "bedroom", label: "Bedroom" }], tasks, questions: [], alternatives: [], exclusions: [] };
}

function byDescription(tasks: PreparedTask[], description: string): PreparedTask {
  return tasks.find((t) => t.description === description)!;
}

describe("TASK-217 acceptance room", () => {
  const scope = toPreparedScope(output(ACCEPTANCE), SUMMARY, PRICE_BOOK, SOURCE);
  const t = (d: string) => byDescription(scope.tasks, d);

  it("wall painting uses the wall-painting method: rate 5012, paint from 400 sq ft", () => {
    expect(t("Paint walls")).toMatchObject({
      method: "wall_paint", hours_low: 6.75, hours_high: 9.25, hours_source: "production_rate", price_book_code: null,
      materials_cents: 3 * 5500,
    });
    expect(t("Paint walls").quantity).toMatchObject({ key: "net_wall_sqft", value: 400 });
  });

  it("ceiling painting uses the ceiling method: price book 5021 with its limitation, paint from 100 sq ft", () => {
    expect(t("Paint ceiling")).toMatchObject({
      method: "ceiling_paint", hours_low: 2, hours_high: 3, hours_source: "price_book", price_book_code: "5021", materials_cents: 5500,
    });
    expect(t("Paint ceiling").quantity).toMatchObject({ key: "ceiling_sqft", value: 100 });
    expect(t("Paint ceiling").estimate_notes).toContainEqual({
      kind: "limitation",
      text: "No ceiling production rate. Hours are price book 5021, a per-room allowance that does not scale with the 100 sq ft measured.",
    });
  });

  it("baseboard painting uses the trim method: rate 5003 marked uncalibrated, paint from 40 linear ft", () => {
    expect(t("Paint baseboard")).toMatchObject({
      method: "trim_paint", hours_low: 2.25, hours_high: 3, hours_source: "production_rate", materials_cents: 5500,
    });
    expect(t("Paint baseboard").quantity).toMatchObject({ key: "baseboard_lf", value: 40 });
    expect(t("Paint baseboard").estimate_notes).toContainEqual({
      kind: "limitation",
      text: "Rate 5003 (120 linear ft a day) has not been checked against your jobs. Review these hours.",
    });
  });

  it("nail holes use drywall prep, folded into wall-painting prep: no extra hours or materials", () => {
    expect(t("Fill six nail holes")).toMatchObject({ method: "drywall_prep", hours_low: 0, hours_high: 0, materials_cents: 0, count: 6 });
    expect(t("Fill six nail holes").estimate_notes?.[0].text).toMatch(/part of standard wall-painting prep \(rate 5012\)/);
  });

  it("generic is used only for work no method fits", () => {
    expect(scope.tasks.filter((x) => x.method === "generic").map((x) => x.description)).toEqual(["Set up, protect floors and clean up"]);
    expect(t("Set up, protect floors and clean up")).toMatchObject({ hours_low: 1, hours_high: 2, hours_source: "ai_allowance", materials_cents: 3000 });
  });

  it("totals: 12–17.25 h and $305 materials, worked out without a selling rate", () => {
    const s = summarizePreparedScope(scope);
    expect(s).toMatchObject({ hours_low: 12, hours_high: 17.25, materials_cents: 30500 });
  });

  it("one room package: one labor line and one materials line; only the price changes with the rate", () => {
    const at85 = preparedScopeToLineItems(scope, 8500).lineItems;
    const at115 = preparedScopeToLineItems(scope, 11500).lineItems;
    expect(at85.map((l) => l.description)).toEqual(["Bedroom — labor, est. 12–17.25 h", "Bedroom — materials allowance"]);
    expect(at85.map((l) => [l.quantity, l.unit_price_cents])).toEqual([[14.75, 8500], [1, 30500]]);
    expect(at115.map((l) => [l.quantity, l.unit_price_cents])).toEqual([[14.75, 11500], [1, 30500]]);
    expect(buildProposalNotes(scope, 8500)).not.toMatch(/rate 5003|uncalibrated|price book/);
  });

  it("assumptions and missing information stay on the tasks, and hours can still be overridden", () => {
    for (const d of ["Paint walls", "Paint ceiling", "Paint baseboard", "Fill six nail holes"]) {
      expect(t(d).estimate_notes?.length).toBeGreaterThan(0);
    }
    const edited = { ...scope, tasks: scope.tasks.map((x) => (x.description === "Paint baseboard" ? { ...x, hours_low: 1.5, hours_high: 2 } : x)) };
    const merged = applyScopeEdits(scope, edited);
    expect(byDescription(merged.tasks, "Paint baseboard")).toMatchObject({ hours_low: 1.5, hours_high: 2, hours_source: "owner", method: "trim_paint" });
  });
});

describe("TASK-217 classification versus method", () => {
  it("ceiling painting stays ceiling painting without a price book entry; hours fall back and say so", () => {
    const scope = toPreparedScope(output([ACCEPTANCE[2]]), SUMMARY, [], SOURCE);
    expect(scope.tasks[0]).toMatchObject({ method: "ceiling_paint", hours_low: 1, hours_high: 1.5, hours_source: "ai_allowance" });
    expect(scope.tasks[0].estimate_notes).toContainEqual({ kind: "missing", text: "No ceiling production rate or price book entry; hours are the AI allowance." });
  });

  it("a missing measurement is flagged and the paint is left unpriced, not guessed", () => {
    const bare = buildAssessmentSummary({ visitId: "v1", assessmentId: "a1", rooms: [{ ...ROOM, length_ft: null }] });
    const scope = toPreparedScope(output(ACCEPTANCE.slice(1, 4)), bare, PRICE_BOOK, SOURCE);
    for (const task of scope.tasks) {
      expect(task.materials_cents).toBeNull();
      expect(task.estimate_notes?.some((n) => n.kind === "missing")).toBe(true);
    }
    expect(byDescription(scope.tasks, "Paint ceiling").method).toBe("ceiling_paint");
  });

  it("trim without rate 5003 uses price book 5003 per room and notes it does not scale", () => {
    const scope = toPreparedScope(output([ACCEPTANCE[3]]), SUMMARY, PRICE_BOOK, { ...SOURCE, trimPaintRate: null });
    expect(scope.tasks[0]).toMatchObject({ method: "trim_paint", hours_low: 1, hours_high: 2, hours_source: "price_book", price_book_code: "5003" });
  });

  it("a measured trim length the owner entered beats the room's baseboard", () => {
    const scope = toPreparedScope(
      output([raw({ description: "Paint door casing", work_type: "trim_paint", quantity_key: "count", count: 60, count_unit: "lf" })]),
      SUMMARY, PRICE_BOOK, SOURCE,
    );
    // 60 ft at 120 ft a day = 4 h
    expect(scope.tasks[0]).toMatchObject({ hours_low: 3.5, hours_high: 4.5, quantity_key: "count", count: 60 });
  });

  it("a surface method with no room is estimated as generic work", () => {
    const scope = toPreparedScope(output([{ ...ACCEPTANCE[2], room_id: null, hours_low: 2, hours_high: 3 }]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(scope.tasks[0]).toMatchObject({ method: "generic", hours_source: "ai_allowance" });
  });
});

describe("TASK-217 no double-counted labor", () => {
  it("never applies a whole-room price book entry to a single surface", () => {
    const scope = toPreparedScope(output([{ ...ACCEPTANCE[2], price_book_code: "5022" }]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(scope.tasks[0]).toMatchObject({ price_book_code: "5021", hours_low: 2, hours_high: 3 });
  });

  it("a whole-room entry on general work is replaced when the room's surfaces are estimated separately", () => {
    const bundle = raw({ description: "Paint the room", work_type: "generic", price_book_code: "5022", hours_low: 5, hours_high: 6 });
    const scope = toPreparedScope(output([ACCEPTANCE[1], bundle]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(byDescription(scope.tasks, "Paint the room")).toMatchObject({ price_book_code: null, hours_low: 5, hours_high: 6, hours_source: "ai_allowance" });
  });

  it("nail holes are priced once with 1001, not per hole, when the walls are not painted", () => {
    const scope = toPreparedScope(output([ACCEPTANCE[4]]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(scope.tasks[0]).toMatchObject({ method: "drywall_prep", hours_low: 0.75, hours_high: 1.5, price_book_code: "1001", materials_cents: null });
    expect(scope.tasks[0].estimate_notes?.map((n) => n.text)).toContain(
      'Price book 1001 (Drywall patch <=6"), counted once for these 6 repairs, not per hole.',
    );
  });

  it("repairs needing a return visit, and texture matching, are estimated separately even with the walls painted", () => {
    const visit = raw({ description: "Patch and recoat dents", work_type: "drywall_prep", quantity_key: "count", count: 2, repair_class: "ordinary_fill", extra_visit: true });
    const texture = raw({ description: "Patch with texture match", work_type: "drywall_prep", quantity_key: "count", count: 1, repair_class: "texture_match" });
    const scope = toPreparedScope(output([ACCEPTANCE[1], visit, texture]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(byDescription(scope.tasks, "Patch and recoat dents")).toMatchObject({ hours_low: 0.75, hours_high: 1.5, price_book_code: "1001" });
    expect(byDescription(scope.tasks, "Patch and recoat dents").estimate_notes?.map((n) => n.text).join(" ")).toMatch(/return visit/);
    expect(byDescription(scope.tasks, "Patch with texture match")).toMatchObject({ hours_low: 3.5, hours_high: 6, price_book_code: "1004" });
  });

  it("touch-up painting in a room whose walls are repainted starts left out", () => {
    const touchUp = raw({ description: "Touch up scuffs", work_type: "generic", price_book_code: "5008" });
    const scope = toPreparedScope(output([ACCEPTANCE[1], touchUp]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(byDescription(scope.tasks, "Touch up scuffs").confirmed).toBe(false);
  });

  it("shared setup is its own task; rate-based hours are not reduced for it", () => {
    const withSetup = toPreparedScope(output(ACCEPTANCE.slice(0, 2)), SUMMARY, PRICE_BOOK, SOURCE);
    const without = toPreparedScope(output([ACCEPTANCE[1]]), SUMMARY, PRICE_BOOK, SOURCE);
    expect(byDescription(withSetup.tasks, "Paint walls")).toMatchObject({ hours_low: 6.75, hours_high: 9.25 });
    expect(byDescription(without.tasks, "Paint walls")).toMatchObject({ hours_low: 6.75, hours_high: 9.25 });
  });
});
