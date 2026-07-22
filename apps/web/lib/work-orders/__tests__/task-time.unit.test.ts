import { describe, expect, it } from "vitest";
import { allRequiredCriteriaMet } from "@ai-fsm/domain";
import {
  criteriaItemsToTaskSeeds,
  minutesByTask,
  tasksToCriteria,
  type WorkOrderTask,
} from "../task-time";

function task(p: Partial<WorkOrderTask> & { id: string }): WorkOrderTask {
  return {
    work_order_id: "wo1",
    label: p.label ?? p.id,
    required: p.required ?? true,
    completed: p.completed ?? false,
    status: p.status ?? "open",
    note: p.note ?? null,
    sort_order: p.sort_order ?? 0,
    ...p,
  };
}

describe("minutesByTask", () => {
  it("sums captured minutes per task and ignores untasked time", () => {
    const m = minutesByTask([
      { task_id: "faucet", minutes: 90 },
      { task_id: "faucet", minutes: 30 }, // faucet total 120
      { task_id: "lights", minutes: 60 },
      { task_id: null, minutes: 45 }, // material run — not a task
    ]);
    expect(m.get("faucet")).toBe(120);
    expect(m.get("lights")).toBe(60);
    expect(m.has("material")).toBe(false);
  });
});

describe("criteriaItemsToTaskSeeds", () => {
  it("maps canonical and legacy shapes", () => {
    const seeds = criteriaItemsToTaskSeeds([
      { label: "Faucet", required: true, completed: false },
      { description: "Lights", done: true },
      { label: "  ", required: true },
    ]);
    expect(seeds).toEqual([
      { label: "Faucet", required: true, completed: false, sort_order: 0 },
      { label: "Lights", required: true, completed: true, sort_order: 1 },
    ]);
  });

  it("returns empty for non-arrays", () => {
    expect(criteriaItemsToTaskSeeds(null)).toEqual([]);
    expect(criteriaItemsToTaskSeeds({})).toEqual([]);
  });
});

describe("tasksToCriteria + completion gate", () => {
  it("gates completion off the first-class tasks", () => {
    const tasks = [
      task({ id: "a", required: true, completed: true }),
      task({ id: "b", required: true, completed: false }),
    ];
    expect(allRequiredCriteriaMet(tasksToCriteria(tasks))).toBe(false);
    tasks[1].completed = true;
    expect(allRequiredCriteriaMet(tasksToCriteria(tasks))).toBe(true);
  });

  it("optional tasks do not block completion", () => {
    const tasks = [
      task({ id: "a", required: true, completed: true }),
      task({ id: "b", required: false, completed: false }),
    ];
    expect(allRequiredCriteriaMet(tasksToCriteria(tasks))).toBe(true);
  });

  it("maps task ids through so FieldCloseout toggles hit work_order_tasks", () => {
    const criteria = tasksToCriteria([
      task({ id: "uuid-1", label: "Replace faucet", completed: false }),
    ]);
    expect(criteria[0]).toMatchObject({ id: "uuid-1", label: "Replace faucet", completed: false });
  });
});

describe("criteriaItemsToTaskSeeds preserves labels for form sync", () => {
  it("keeps completed flags from the office form payload", () => {
    const seeds = criteriaItemsToTaskSeeds([
      { id: "c-1", label: "Replace faucet", required: true, completed: true },
      { id: "c-2", label: "Paint wall", required: false, completed: false },
    ]);
    expect(seeds).toEqual([
      { label: "Replace faucet", required: true, completed: true, sort_order: 0 },
      { label: "Paint wall", required: false, completed: false, sort_order: 1 },
    ]);
  });
});
