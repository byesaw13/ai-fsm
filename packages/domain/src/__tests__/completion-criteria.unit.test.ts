import { describe, it, expect } from "vitest";
import {
  allRequiredCriteriaMet,
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