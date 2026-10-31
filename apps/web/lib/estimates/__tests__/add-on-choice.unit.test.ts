import { describe, it, expect } from "vitest";
import { chosenAddOns } from "../add-on-choice";

const SCOPE = {
  version: 1,
  source: { visit_id: "v", assessment_id: null, assessment_updated_at: null },
  groups: [], tasks: [], questions: [], exclusions: [],
  alternatives: [
    { id: "a1", label: "Son's room, whole room", task_ids: [], note: null, price_cents: 75_000 },
    { id: "a2", label: "Foyer stairwell", task_ids: [], note: "Same space", price_cents: 105_000 },
    { id: "a3", label: "Trim touch-ups", task_ids: [], note: null, price_cents: null },
  ],
};

describe("chosenAddOns (TASK-225)", () => {
  it("returns the ticked priced add-ons in the quote's order, once each", () => {
    expect(chosenAddOns(SCOPE, ["a2", "a1", "a2"])).toEqual([
      { id: "a1", label: "Son's room, whole room", price_cents: 75_000 },
      { id: "a2", label: "Foyer stairwell", price_cents: 105_000 },
    ]);
  });

  it("nothing ticked is an empty choice", () => {
    expect(chosenAddOns(SCOPE, [])).toEqual([]);
    expect(chosenAddOns(null, [])).toEqual([]);
  });

  it("refuses an add-on that is unknown or has no price", () => {
    expect(() => chosenAddOns(SCOPE, ["a9"])).toThrow(/not part of this quote/);
    expect(() => chosenAddOns(SCOPE, ["a3"])).toThrow(/not part of this quote/);
    expect(() => chosenAddOns(null, ["a1"])).toThrow(/not part of this quote/);
  });
});
