import { describe, it, expect } from "vitest";
import {
  allRequiredCriteriaMet,
  completionGateMessage,
  seedCompletionCriteriaFromLineItems,
} from "../completion-criteria";

describe("seedCompletionCriteriaFromLineItems", () => {
  it("creates required criteria from labor lines only", () => {
    const criteria = seedCompletionCriteriaFromLineItems([
      { description: "Install faucet", line_item_type: "labor" },
      { description: "PEX fittings", line_item_type: "materials" },
    ]);
    expect(criteria).toHaveLength(1);
    expect(criteria[0].label).toBe("Install faucet");
    expect(criteria[0].required).toBe(true);
    expect(criteria[0].completed).toBe(false);
  });
});

describe("completionGateMessage", () => {
  it("blocks completion when criteria are unchecked", () => {
    expect(
      completionGateMessage(
        [{ status: "completed" }],
        [{ id: "1", label: "Install vanity", required: true, completed: false }],
      ),
    ).toContain("completion criteria");
  });

  it("allows completion when visits and criteria are satisfied", () => {
    expect(
      completionGateMessage(
        [{ status: "completed" }],
        [{ id: "1", label: "Install vanity", required: true, completed: true }],
      ),
    ).toBeNull();
  });
});

describe("allRequiredCriteriaMet", () => {
  it("returns true when no required criteria exist", () => {
    expect(allRequiredCriteriaMet([])).toBe(true);
  });

  it("returns false when a required item is unchecked", () => {
    expect(
      allRequiredCriteriaMet([
        { id: "1", label: "Done", required: true, completed: false },
      ]),
    ).toBe(false);
  });
});