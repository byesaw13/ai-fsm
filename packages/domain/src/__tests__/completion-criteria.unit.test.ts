import { describe, it, expect } from "vitest";
import {
  allRequiredCriteriaMet,
  completionGateMessage,
  normalizeCompletionCriteria,
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

  it("skips T&M budgets, materials/lift allowances, and other pricing prose", () => {
    const criteria = seedCompletionCriteriaFromLineItems([
      {
        description:
          "Labor — T&M estimated budget (90 hours @ $115/hr). Maximum authorized: 110 hours without prior written owner approval. Billed on actual hours worked.",
        line_item_type: "labor",
      },
      {
        description:
          "Materials allowance — drywall, joint compound, lumber/framing, insulation, trim…",
        line_item_type: "labor",
      },
      {
        description:
          "Lift access allowance — lift rental, delivery, pickup, and associated rental fees.",
        line_item_type: "labor",
      },
      { description: "Replace exterior light fixtures", line_item_type: "labor" },
    ]);
    expect(criteria.map((c) => c.label)).toEqual(["Replace exterior light fixtures"]);
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

describe("normalizeCompletionCriteria", () => {
  it("maps legacy done/description shape and fails closed (required)", () => {
    const criteria = normalizeCompletionCriteria([
      { done: false, description: "Labor budget" },
      { done: true, description: "Materials allowance" },
    ]);
    expect(criteria).toHaveLength(2);
    expect(criteria[0]).toMatchObject({
      label: "Labor budget",
      required: true,
      completed: false,
    });
    expect(criteria[1].completed).toBe(true);
    expect(allRequiredCriteriaMet(criteria)).toBe(false);
  });

  it("preserves canonical criteria", () => {
    const criteria = normalizeCompletionCriteria([
      { id: "x", label: "Install vanity", required: true, completed: true },
    ]);
    expect(criteria[0]).toEqual({
      id: "x",
      label: "Install vanity",
      required: true,
      completed: true,
    });
    expect(allRequiredCriteriaMet(criteria)).toBe(true);
  });
});