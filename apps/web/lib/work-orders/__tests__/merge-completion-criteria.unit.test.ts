import { describe, it, expect } from "vitest";
import { mergeCompletionCriteriaToggles } from "../lead-access";

describe("mergeCompletionCriteriaToggles", () => {
  const existing = [
    { id: "a", label: "Task A", required: true, completed: false },
    { id: "b", label: "Task B", required: false, completed: true },
  ];

  it("updates completed flags only", () => {
    const merged = mergeCompletionCriteriaToggles(existing, [{ id: "a", completed: true }]);
    expect(merged).toEqual([
      { id: "a", label: "Task A", required: true, completed: true },
      { id: "b", label: "Task B", required: false, completed: true },
    ]);
  });

  it("rejects unknown criterion ids", () => {
    const merged = mergeCompletionCriteriaToggles(existing, [{ id: "missing", completed: true }]);
    expect(merged).toEqual({ error: "Unknown completion criterion: missing" });
  });

  it("ignores client attempts to strip required items", () => {
    const merged = mergeCompletionCriteriaToggles(existing, []);
    expect(merged).toEqual(existing);
  });
});