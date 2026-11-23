import { describe, expect, it } from "vitest";
import { computeHourlyBaseline, DEFAULT_PRICING_SETTINGS } from "@ai-fsm/domain";
import {
  baselineInputFor,
  baselineParts,
  baselineSnapshot,
  beforeSendChecklist,
  sendBaselineGate,
  type BaselineEstimateRow,
  type BaselineLineRow,
} from "../baseline";

const settings = {
  ...DEFAULT_PRICING_SETTINGS,
  labor_billing_cents_per_hour: 8500,
  labor_cost_cents_per_hour: 5000,
  material_handling_pct: 15,
  ma_labor_rate_delta: 0.15,
  baseline_warning_pct: 10,
};

const est = (over: Partial<BaselineEstimateRow> = {}): BaselineEstimateRow => ({
  subtotal_cents: 83000,
  presentation_mode: "standard",
  labor_hours_low: null,
  labor_hours_high: null,
  travel_surcharge_cents: 0,
  handling_in_baseline: false,
  other_direct_cost_cents: 2600,
  direct_costs_confirmed_at: "2026-11-23T00:00:00Z",
  ...over,
});

const line = (over: Partial<BaselineLineRow>): BaselineLineRow => ({
  line_item_type: "labor",
  quantity: "1.00",
  unit_price_cents: 0,
  unit_cost_cents: null,
  hours_low: null,
  hours_high: null,
  hours_source: null,
  adjustment_type: null,
  description: "Line",
  ...over,
});

// Formula example F, as stored rows (numerics arrive as strings).
const exampleF: BaselineLineRow[] = [
  line({ description: "Hang shelves", unit_price_cents: 59500, hours_low: "6.00", hours_high: "8.00", hours_source: "owner" }),
  line({ description: "Lumber", line_item_type: "materials", unit_price_cents: 12000, unit_cost_cents: 12000 }),
  line({
    description: "Travel — Travel time", line_item_type: "adjustment", adjustment_type: "travel_surcharge",
    unit_price_cents: 8500, hours_low: "1.00", hours_high: "1.00", hours_source: "travel_calc",
  }),
  line({ description: "Travel — Mileage", line_item_type: "adjustment", adjustment_type: "travel_surcharge", unit_price_cents: 3000 }),
];

describe("baselineInputFor", () => {
  it("reads example F from stored rows: travel time is hours, mileage is a travel charge", () => {
    const input = baselineInputFor(est(), exampleF, settings, "NH");
    expect(input.lines[2].isTravelTime).toBe(true);
    expect(input.lines[3].isTravelTime).toBe(false);
    expect(input.travelSurchargeCents).toBe(3000);
    const r = computeHourlyBaseline(input);
    expect(r.baseline).toEqual({ low: 74500, mid: 83000, high: 91500 });
    expect(r.effectiveRateCents).toBe(7600);
  });

  it("uses the Massachusetts selling rate the quote lines use", () => {
    expect(baselineInputFor(est(), exampleF, settings, "MA").sellRateCents).toBe(9775);
    expect(baselineInputFor(est(), exampleF, settings, null).sellRateCents).toBe(8500);
  });

  it("an unconfirmed estimate and a blank cost stay missing, never 0", () => {
    const input = baselineInputFor(
      est({ direct_costs_confirmed_at: null, other_direct_cost_cents: null }),
      [line({ line_item_type: "materials", unit_price_cents: 5000 })],
      settings,
      null,
    );
    expect(input.otherDirectConfirmed).toBe(false);
    expect(input.otherDirectCents).toBeNull();
    expect(input.lines[0].costCents).toBeNull();
  });

  it("adds the estimate's travel surcharge to other travel charges", () => {
    const input = baselineInputFor(est({ travel_surcharge_cents: 2500 }), exampleF, settings, null);
    expect(input.travelSurchargeCents).toBe(5500);
  });
});

describe("sendBaselineGate", () => {
  const complete = (quoted: number) => {
    const input = baselineInputFor(
      est({ subtotal_cents: quoted, other_direct_cost_cents: 0 }),
      [line({ unit_price_cents: quoted, hours_low: 20, hours_high: 20 })],
      settings,
      null,
    );
    return { input, result: computeHourlyBaseline(input) };
  };

  it("blocks while hours are missing", () => {
    const input = baselineInputFor(est(), [line({ unit_price_cents: 50000 })], settings, null);
    const gate = sendBaselineGate({ optionQuote: false, input, result: computeHourlyBaseline(input), acknowledged: false });
    expect(gate).toEqual({ kind: "incomplete", missing: [{ kind: "hours", lineIndex: 0 }] });
  });

  it("asks for the acknowledgment below the cost floor", () => {
    const { input, result } = complete(90000);
    expect(sendBaselineGate({ optionQuote: false, input, result, acknowledged: false })).toEqual({
      kind: "ack_required",
      effectiveRateCents: 4500,
      costFloorCents: 5000,
    });
  });

  it("sends below the floor once acknowledged", () => {
    const { input, result } = complete(90000);
    expect(sendBaselineGate({ optionQuote: false, input, result, acknowledged: true })).toEqual({ kind: "ok" });
  });

  it("sends a complete quote above the floor without asking", () => {
    const { input, result } = complete(170000);
    expect(sendBaselineGate({ optionQuote: false, input, result, acknowledged: false })).toEqual({ kind: "ok" });
  });

  it("warnings never block", () => {
    const { input, result } = complete(110000);
    expect(result.warning).toBe("strong");
    expect(sendBaselineGate({ optionQuote: false, input, result, acknowledged: false })).toEqual({ kind: "ok" });
  });

  it("option quotes skip the rules", () => {
    const input = baselineInputFor(est(), [line({ unit_price_cents: 50000 })], settings, null);
    expect(sendBaselineGate({ optionQuote: true, input, result: computeHourlyBaseline(input), acknowledged: false }))
      .toEqual({ kind: "skip" });
  });
});

describe("beforeSendChecklist", () => {
  it("two labor lines without hours give two rows, each linking to its field", () => {
    const lines = [line({ description: "Walls" }), line({ description: "Trim" })];
    const input = baselineInputFor(est(), lines, settings, null);
    const rows = beforeSendChecklist(computeHourlyBaseline(input).missing, lines);
    expect(rows.map((r) => r.href)).toEqual(["#edit-line-hours-0", "#edit-line-hours-1"]);
    expect(rows[1].label).toContain("Trim");
  });

  it("links costs, flat hours, travel hours and other direct costs to their fields", () => {
    const lines = [
      line({ description: "Paint", line_item_type: "materials", unit_price_cents: 5000 }),
      line({ description: "Travel — Travel time", line_item_type: "adjustment", adjustment_type: "travel_surcharge", unit_price_cents: 8500 }),
    ];
    const input = baselineInputFor(est({ direct_costs_confirmed_at: null }), lines, settings, null);
    const rows = beforeSendChecklist(computeHourlyBaseline(input).missing, lines);
    expect(rows.map((r) => r.href)).toEqual([
      "#edit-person-hours-low",
      "#travel-panel",
      "#edit-line-cost-0",
      "#baseline-other-direct",
    ]);
  });
});

describe("baselineParts and baselineSnapshot", () => {
  it("shows materials and handling apart; a marked-up line gets no handling", () => {
    const lines = [
      line({ line_item_type: "materials", unit_price_cents: 24000, unit_cost_cents: 20000 }),
      line({ line_item_type: "materials", unit_price_cents: 10000, unit_cost_cents: 10000 }),
    ];
    expect(baselineParts(baselineInputFor(est(), lines, settings, null))).toEqual({
      materialsCostCents: 30000,
      equipmentCostCents: 0,
      handlingCents: 1500,
    });
  });

  it("freezes the rates with the result", () => {
    const input = baselineInputFor(est(), exampleF, settings, null);
    const snap = baselineSnapshot(input, computeHourlyBaseline(input), new Date("2026-11-23T12:00:00Z"));
    expect(snap).toMatchObject({
      version: 1,
      frozen_at: "2026-11-23T12:00:00.000Z",
      sell_rate_cents: 8500,
      cost_floor_cents: 5000,
      handling_pct: 15,
      warning_pct: 10,
      quoted_cents: 83000,
    });
  });
});
