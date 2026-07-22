import { describe, expect, it } from "vitest";

/**
 * Pure guard rules for day planning + partial remainder (mirrors API intent).
 */
function canPlanOnDay(t: { completed: boolean; status: string }): boolean {
  return !t.completed && t.status !== "done";
}

function canChangeStatus(t: { completed: boolean; status: string }, next: "done" | "partial" | "open"): boolean {
  if (t.completed || t.status === "done") return next === "done"; // locked except no-op done
  return true;
}

describe("day task selection rules", () => {
  it("done tasks are not plan-selectable", () => {
    expect(canPlanOnDay({ completed: true, status: "done" })).toBe(false);
    expect(canPlanOnDay({ completed: false, status: "done" })).toBe(false);
    expect(canPlanOnDay({ completed: false, status: "open" })).toBe(true);
    expect(canPlanOnDay({ completed: false, status: "partial" })).toBe(true);
  });

  it("done tasks cannot be reopened or marked partial", () => {
    const done = { completed: true, status: "done" };
    expect(canChangeStatus(done, "open")).toBe(false);
    expect(canChangeStatus(done, "partial")).toBe(false);
    expect(canChangeStatus(done, "done")).toBe(true);
  });
});
