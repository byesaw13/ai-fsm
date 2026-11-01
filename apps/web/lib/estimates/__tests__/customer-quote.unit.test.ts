import { describe, expect, it } from "vitest";
import { customerAddOns, depositLabel, showsQuantityAndRate } from "../customer-quote";

describe("customerAddOns (TASK-224)", () => {
  const scope = {
    version: 1,
    source: { visit_id: "v", assessment_id: null, assessment_updated_at: null },
    groups: [],
    tasks: [],
    questions: [],
    exclusions: [],
    alternatives: [
      { id: "a1", label: "Son's room, whole room", task_ids: ["t7"], note: null, price_cents: 75_000 },
      { id: "a2", label: "Foyer stairwell", task_ids: [], note: "Same space as the foyer", price_cents: 105_000 },
      { id: "a3", label: "Trim touch-ups", task_ids: [], note: null },
    ],
  };

  it("lists each option's label, note and price, in order", () => {
    expect(customerAddOns(scope)).toEqual([
      { id: "a1", label: "Son's room, whole room", note: null, price_cents: 75_000 },
      { id: "a2", label: "Foyer stairwell", note: "Same space as the foyer", price_cents: 105_000 },
      { id: "a3", label: "Trim touch-ups", note: null, price_cents: null },
    ]);
  });

  it("is empty for a quote without a prepared scope or with an unreadable one", () => {
    expect(customerAddOns(null)).toEqual([]);
    expect(customerAddOns({ nope: true })).toEqual([]);
  });
});

describe("showsQuantityAndRate (TASK-224)", () => {
  it("hides quantity and rate on labor lines only", () => {
    expect(showsQuantityAndRate("labor")).toBe(false);
    expect(showsQuantityAndRate("materials")).toBe(true);
    expect(showsQuantityAndRate("equipment")).toBe(true);
    expect(showsQuantityAndRate(null)).toBe(true);
  });
});

describe("depositLabel (TASK-230)", () => {
  it("names the percentage that books the work", () => {
    expect(depositLabel("percentage", "30.00")).toBe("Deposit to book (30%)");
    expect(depositLabel("percentage", 33.5)).toBe("Deposit to book (33.5%)");
  });
  it("falls back without a percentage", () => {
    expect(depositLabel("fixed", null)).toBe("Deposit to book");
    expect(depositLabel("materials", 0)).toBe("Deposit to book");
  });
});
