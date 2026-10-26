import { describe, it, expect } from "vitest";
import { buildAssessmentSummary, type AssessmentRoom, type PreparedScope, type PreparedTask } from "@ai-fsm/domain";
import { applyRevision, buildRevisionPrompt, recordRevision, type RevisionOutput } from "../revise-quote";

const ROOMS: AssessmentRoom[] = [
  { id: "p1", name: "Pantry", length_ft: 11, width_ft: 7, height_ft: 9, notes: "", door_count: 1, window_count: 0 },
  { id: "s1", name: "Son's room", length_ft: 16, width_ft: 17.5, height_ft: 8, notes: "", door_count: 2, window_count: 2 },
];
const SUMMARY = buildAssessmentSummary({ visitId: "v1", assessmentId: "a1", rooms: ROOMS });
const CTX = { summary: SUMMARY, priceBook: [], wallPaintRate: { sqft_per_day: 400, tall_wall_modifier_pct: -0.15 } };

function task(t: Partial<PreparedTask> & Pick<PreparedTask, "id" | "group_key" | "description">): PreparedTask {
  return {
    room_id: null, kind: "requested", confirmed: true, quantity_key: null, count: null, quantity: null,
    hours_low: 2, hours_high: 3, hours_source: "ai_allowance", materials_cents: 1000, ...t,
  };
}

// From a real draft: the owner answered "No" about the pantry cabinets, but the task stayed in.
const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v1", assessment_id: "a1", assessment_updated_at: null },
  groups: [{ key: "pantry", label: "Pantry" }, { key: "son", label: "Son's room" }],
  tasks: [
    task({ id: "t4", room_id: "p1", group_key: "pantry", description: "Paint pantry walls" }),
    task({ id: "t5", room_id: "p1", group_key: "pantry", description: "Paint pantry shelves/cabinets", hours_low: 2.5, hours_high: 4.5, materials_cents: null }),
    task({ id: "t3", room_id: "s1", group_key: "son", description: "Remove wallpaper", hours_low: 4, hours_high: 7 }),
  ],
  questions: [{ id: "q1", task_ids: ["t5"], text: "Paint the pantry cabinets?", answer: "No, they will need to be removed or masked" }],
  alternatives: [],
  exclusions: [],
};

function change(c: Partial<RevisionOutput["changes"][number]> & Pick<RevisionOutput["changes"][number], "action" | "reason">) {
  return { task_id: null, update: null, task: null, ref: null, ...c };
}

const ADD_TASK = {
  room_id: "s1", description: "Paint the remaining walls", kind: "requested" as const, group_key: "son", quantity_key: "net_wall_sqft" as const,
  count: null, count_unit: null, hours_low: 6, hours_high: 9, materials_cents: 20000, customer_supplied: false, is_alternative: false,
  price_book_code: null, work_type: "wall_paint" as const, paint_grade: "premium" as const,
};

describe("applyRevision (TASK-186)", () => {
  it("excludes a task an answer rules out, without deleting it", () => {
    const { scope, changes } = applyRevision(SCOPE, { summary: "s", changes: [change({ action: "exclude", task_id: "t5", reason: "You said no." })], alternatives_add: [] }, CTX);
    expect(scope.tasks.find((t) => t.id === "t5")).toMatchObject({ confirmed: false, description: "Paint pantry shelves/cabinets" });
    expect(changes).toEqual([
      expect.objectContaining({ task_id: "t5", action: "exclude", before: expect.objectContaining({ confirmed: true }), after: expect.objectContaining({ confirmed: false }), reason: "You said no." }),
    ]);
  });

  it("updates hours and labels them as revised; keeps fields set to null", () => {
    const out: RevisionOutput = {
      summary: "s",
      changes: [change({ action: "update", task_id: "t3", update: { description: null, hours_low: 6, hours_high: 3, materials_cents: null }, reason: "Two layers." })],
      alternatives_add: [],
    };
    const t3 = applyRevision(SCOPE, out, CTX).scope.tasks.find((t) => t.id === "t3")!;
    expect(t3).toMatchObject({ hours_low: 3, hours_high: 6, hours_source: "revision", materials_cents: 1000, description: "Remove wallpaper" });
  });

  it("adds work built like prepared work: next id, bound quantity, paced hours, computed paint", () => {
    const { scope, changes } = applyRevision(SCOPE, { summary: "s", changes: [change({ action: "add", task: ADD_TASK, ref: "n1", reason: "Whole room." })], alternatives_add: [] }, CTX);
    const added = scope.tasks.at(-1)!;
    expect(added).toMatchObject({ id: "t6", group_key: "son", confirmed: true, hours_low: 8, hours_high: 10.75, hours_source: "production_rate", materials_cents: 22500 });
    expect(added.quantity).toMatchObject({ key: "net_wall_sqft", value: 466 });
    expect(changes[0]).toMatchObject({ task_id: "t6", action: "add", before: null });
  });

  it("adds an option pair that refers to an added task by its ref", () => {
    const alt = { ...ADD_TASK, description: "LVP instead", is_alternative: true, work_type: "other" as const, quantity_key: null, paint_grade: null };
    const out: RevisionOutput = {
      summary: "s",
      changes: [change({ action: "add", task: alt, ref: "lvp", reason: "Compare." })],
      alternatives_add: [{ label: "Wallpaper wall vs LVP", task_refs: ["t3", "lvp", "ghost"], note: null }],
    };
    const { scope } = applyRevision(SCOPE, out, CTX);
    expect(scope.tasks.at(-1)).toMatchObject({ id: "t6", confirmed: false });
    expect(scope.alternatives).toEqual([{ id: "a1", label: "Wallpaper wall vs LVP", task_ids: ["t3", "t6"], note: null }]);
  });

  it("skips unknown task ids and changes that change nothing", () => {
    const out: RevisionOutput = {
      summary: "s",
      changes: [
        change({ action: "exclude", task_id: "t99", reason: "x" }),
        change({ action: "include", task_id: "t4", reason: "already in" }),
      ],
      alternatives_add: [],
    };
    const { scope, changes } = applyRevision(SCOPE, out, CTX);
    expect(changes).toEqual([]);
    expect(scope.tasks).toEqual(SCOPE.tasks);
  });

  it("does not change the scope it was given", () => {
    applyRevision(SCOPE, { summary: "s", changes: [change({ action: "exclude", task_id: "t5", reason: "x" })], alternatives_add: [] }, CTX);
    expect(SCOPE.tasks[1].confirmed).toBe(true);
  });
});

describe("revision prompt and log", () => {
  it("lists tasks with ids, the owner's answers and the instruction", () => {
    const prompt = buildRevisionPrompt(SCOPE, SUMMARY, "Wallpaper is two layers");
    expect(prompt).toMatch(/- t5 \[included\] Paint pantry shelves\/cabinets/);
    expect(prompt).toMatch(/Answer: No, they will need to be removed or masked \(tasks t5\)/);
    expect(prompt).toMatch(/## What the owner wants changed\nWallpaper is two layers/);
    expect(buildRevisionPrompt(SCOPE, SUMMARY, "")).toMatch(/Apply the answers above\./);
  });

  it("records kept revisions, newest last", () => {
    const once = recordRevision(SCOPE, "note 1", "did 1", "2026-10-25T00:00:00Z");
    const twice = recordRevision(once, "note 2", "did 2", "2026-10-25T01:00:00Z");
    expect(twice.revisions?.map((r) => r.instruction)).toEqual(["note 1", "note 2"]);
  });
});
