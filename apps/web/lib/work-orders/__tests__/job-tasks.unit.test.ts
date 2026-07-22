import { describe, expect, it } from "vitest";
import { computeTaskProgress, type JobTaskRow } from "../job-tasks";

function t(p: Partial<JobTaskRow> & { id: string; completed?: boolean; required?: boolean }): JobTaskRow {
  return {
    work_order_id: "wo1",
    label: p.label ?? `Task ${p.id}`,
    required: p.required ?? true,
    completed: p.completed ?? false,
    status: p.completed ? "done" : "open",
    note: null,
    sort_order: 0,
    work_order_title: "Main",
    work_order_status: "ready",
    ...p,
  };
}

describe("computeTaskProgress", () => {
  it("uses required tasks for percent when any are required", () => {
    const p = computeTaskProgress([
      t({ id: "a", label: "Replace faucet", required: true, completed: true }),
      t({ id: "b", label: "Paint wall", required: true, completed: false }),
      t({ id: "c", label: "Optional caulk", required: false, completed: true }),
    ]);
    expect(p.required_total).toBe(2);
    expect(p.required_done).toBe(1);
    expect(p.percent).toBe(50);
    expect(p.done).toBe(2);
  });

  it("falls back to all tasks when none are required", () => {
    const p = computeTaskProgress([
      t({ id: "a", label: "Touch up paint", required: false, completed: true }),
      t({ id: "b", label: "Optional caulk", required: false, completed: false }),
    ]);
    expect(p.percent).toBe(50);
  });

  it("is 0% with no tasks", () => {
    expect(computeTaskProgress([]).percent).toBe(0);
  });

  it("is 100% when all required done", () => {
    const p = computeTaskProgress([
      t({ id: "a", label: "Replace faucet", required: true, completed: true }),
      t({ id: "b", label: "Optional caulk", required: false, completed: false }),
    ]);
    expect(p.percent).toBe(100);
  });

  it("ignores estimate pricing lines that were wrongly stored as tasks", () => {
    const p = computeTaskProgress([
      t({
        id: "bad",
        label: "Labor — T&M estimated budget (90 hours @ $115/hr). Billed on actual hours.",
        required: true,
        completed: false,
      }),
      t({ id: "good", label: "Install lattice skirting", required: true, completed: true }),
    ]);
    expect(p.total).toBe(1);
    expect(p.percent).toBe(100);
    expect(p.tasks.map((x) => x.label)).toEqual(["Install lattice skirting"]);
  });
});
