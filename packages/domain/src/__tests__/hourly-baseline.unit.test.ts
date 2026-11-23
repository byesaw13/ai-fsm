import { describe, expect, it } from "vitest";
import { computeHourlyBaseline, type BaselineInput, type BaselineLine } from "../hourly-baseline";

const RATE = 8500;
const FLOOR = 5000;

function labor(low: number | null, high: number | null, priceCents: number): BaselineLine {
  return { type: "labor", isTravelTime: false, hoursLow: low, hoursHigh: high, costCents: null, priceCents };
}
function materials(costCents: number | null, priceCents: number): BaselineLine {
  return { type: "materials", isTravelTime: false, hoursLow: null, hoursHigh: null, costCents, priceCents };
}

function input(partial: Partial<BaselineInput>): BaselineInput {
  return {
    lines: [],
    estimateHours: null,
    travelSurchargeCents: 0,
    sellRateCents: RATE,
    costFloorCents: FLOOR,
    handlingPct: 15,
    handlingOn: false,
    otherDirectCents: 0,
    otherDirectConfirmed: true,
    quotedCents: 0,
    warningPct: 10,
    ...partial,
  };
}

// Fixture A: eight work areas, four with paint priced.
const FIXTURE_A_HOURS: [number, number, number][] = [
  [9, 16, 12.5],
  [13.25, 20.25, 16.75],
  [2, 3, 2.5],
  [8, 12, 10],
  [7.5, 10.25, 9],
  [7, 10, 8.5],
  [12, 20, 16],
  [29, 40.75, 35],
];
const fixtureALines: BaselineLine[] = [
  ...FIXTURE_A_HOURS.map(([lo, hi, q]) => labor(lo, hi, Math.round(q * RATE))),
  materials(30000, 30000),
  materials(29500, 29500),
  materials(22500, 22500),
  materials(63000, 63000),
];

describe("computeHourlyBaseline (formula examples A to G)", () => {
  it("A: prepared repaint", () => {
    const r = computeHourlyBaseline(input({ lines: fixtureALines, quotedCents: 1082125 }));
    expect(r.complete).toBe(true);
    expect(r.hours).toEqual({ low: 87.75, mid: 110, high: 132.25 });
    expect(r.baseline).toEqual({ low: 890875, mid: 1080000, high: 1269125 });
    expect(r.gapCents).toBe(2125);
    expect(r.gapPct).toBe(0.2);
    expect(r.effectiveRateCents).toBe(7086);
    expect(r.warning).toBe("none");
    expect(r.belowCostFloor).toBe(false);
  });

  it("B: Fixture A with handling on", () => {
    const r = computeHourlyBaseline(input({ lines: fixtureALines, quotedCents: 1082125, handlingOn: true }));
    expect(r.baseline?.mid).toBe(1101750);
    expect(r.gapCents).toBe(-19625);
    expect(r.gapPct).toBe(-1.78);
    expect(r.warning).toBe("below");
    expect(r.effectiveRateCents).toBe(7086);
  });

  const flat = (quotedCents: number) =>
    input({
      lines: [materials(30000, 30000)],
      estimateHours: { low: 20, high: 30 },
      otherDirectCents: 4000,
      quotedCents,
    });

  it("C: flat price, priced low", () => {
    const r = computeHourlyBaseline(flat(200000));
    expect(r.baseline).toEqual({ low: 200000, mid: 242500, high: 285000 });
    expect(r.gapCents).toBe(-42500);
    expect(r.gapPct).toBe(-17.53);
    expect(r.warning).toBe("strong");
    expect(r.effectiveRateCents).toBe(5533);
    expect(r.belowCostFloor).toBe(false);
  });

  it("D: the same flat quote at $1,700 is below the cost floor", () => {
    const r = computeHourlyBaseline(flat(170000));
    expect(r.gapCents).toBe(-72500);
    expect(r.gapPct).toBe(-29.9);
    expect(r.warning).toBe("strong");
    expect(r.effectiveRateCents).toBe(4533);
    expect(r.belowCostFloor).toBe(true);
  });

  it("E: incomplete hours shows no totals and names the line", () => {
    const r = computeHourlyBaseline(input({ lines: [labor(10, 12, 93500), labor(null, null, 50000)], quotedCents: 143500 }));
    expect(r.complete).toBe(false);
    expect(r.missing).toEqual([{ kind: "hours", lineIndex: 1 }]);
    expect(r.hours).toBeNull();
    expect(r.baseline).toBeNull();
    expect(r.gapCents).toBeNull();
    expect(r.effectiveRateCents).toBeNull();
    expect(r.belowCostFloor).toBeNull();
    expect(r.warning).toBe("none");
  });

  it("F: travel time counted once as hours", () => {
    const r = computeHourlyBaseline(
      input({
        lines: [
          labor(6, 8, 59500),
          materials(12000, 12000),
          { type: "adjustment", isTravelTime: true, hoursLow: 1, hoursHigh: 1, costCents: null, priceCents: 8500 },
          { type: "adjustment", isTravelTime: false, hoursLow: null, hoursHigh: null, costCents: null, priceCents: 3000 },
        ],
        travelSurchargeCents: 3000,
        otherDirectCents: 2600,
        quotedCents: 83000,
      }),
    );
    expect(r.hours).toEqual({ low: 7, mid: 8, high: 9 });
    expect(r.baseline).toEqual({ low: 74500, mid: 83000, high: 91500 });
    expect(r.gapCents).toBe(0);
    expect(r.gapPct).toBe(0);
    expect(r.effectiveRateCents).toBe(7600);
  });

  it("G: a marked-up line gets no handling", () => {
    const r = computeHourlyBaseline(
      input({
        lines: [
          labor(10, 14, 102000),
          materials(20000, 24000),
          materials(10000, 10000),
          { type: "handling_fee", isTravelTime: false, hoursLow: null, hoursHigh: null, costCents: null, priceCents: 1500 },
        ],
        handlingOn: true,
        quotedCents: 137500,
      }),
    );
    expect(r.baseline).toEqual({ low: 116500, mid: 133500, high: 150500 });
    expect(r.gapCents).toBe(4000);
    expect(r.gapPct).toBe(3);
    expect(r.effectiveRateCents).toBe(7679);
  });
});

describe("computeHourlyBaseline rules", () => {
  it("a flat quote with no labor lines and no range is missing hours", () => {
    const r = computeHourlyBaseline(input({ lines: [materials(100, 100)], quotedCents: 100000 }));
    expect(r.missing).toEqual([{ kind: "hours" }]);
    expect(r.complete).toBe(false);
  });

  it("the estimate range is ignored when labor lines exist (never added)", () => {
    const r = computeHourlyBaseline(
      input({ lines: [labor(2, 4, 25500)], estimateHours: { low: 20, high: 30 }, quotedCents: 25500 }),
    );
    expect(r.hours).toEqual({ low: 2, mid: 3, high: 4 });
  });

  it("high hours of 0 or low above high count as missing", () => {
    const r = computeHourlyBaseline(input({ lines: [labor(0, 0, 100), labor(5, 3, 100)] }));
    expect(r.missing).toEqual([
      { kind: "hours", lineIndex: 0 },
      { kind: "hours", lineIndex: 1 },
    ]);
  });

  it("a travel-time line needs hours too", () => {
    const r = computeHourlyBaseline(
      input({
        lines: [
          labor(1, 2, 12750),
          { type: "adjustment", isTravelTime: true, hoursLow: null, hoursHigh: null, costCents: null, priceCents: 8500 },
        ],
      }),
    );
    expect(r.missing).toEqual([{ kind: "hours", lineIndex: 1 }]);
  });

  it("materials or equipment without a cost, and unconfirmed other costs, are missing costs", () => {
    const r = computeHourlyBaseline(
      input({
        lines: [
          labor(1, 2, 12750),
          materials(null, 5000),
          { type: "equipment", isTravelTime: false, hoursLow: null, hoursHigh: null, costCents: null, priceCents: 12000 },
        ],
        otherDirectConfirmed: false,
        quotedCents: 29750,
      }),
    );
    expect(r.missing).toEqual([
      { kind: "cost", lineIndex: 1 },
      { kind: "cost", lineIndex: 2 },
      { kind: "other_direct" },
    ]);
    expect(r.hours).toEqual({ low: 1, mid: 1.5, high: 2 });
    expect(r.baseline).toBeNull();
    expect(r.effectiveRateCents).toBeNull();
  });

  it("with line costs known but other costs unconfirmed, the gap shows and the floor does not", () => {
    const r = computeHourlyBaseline(
      input({ lines: [labor(10, 10, 85000)], otherDirectConfirmed: false, otherDirectCents: null, quotedCents: 85000 }),
    );
    expect(r.baseline?.mid).toBe(85000);
    expect(r.gapCents).toBe(0);
    expect(r.effectiveRateCents).toBeNull();
    expect(r.belowCostFloor).toBeNull();
  });

  it("equipment enters the baseline at cost and gets no handling", () => {
    const r = computeHourlyBaseline(
      input({
        lines: [
          labor(10, 10, 85000),
          { type: "equipment", isTravelTime: false, hoursLow: null, hoursHigh: null, costCents: 12000, priceCents: 12000 },
        ],
        handlingOn: true,
        quotedCents: 97000,
      }),
    );
    expect(r.baseline?.mid).toBe(97000);
    expect(r.effectiveRateCents).toBe(8500);
  });

  it("the warning threshold is the setting: 12% below is strong at 10, only below at 15", () => {
    const at = (warningPct: number) =>
      computeHourlyBaseline(input({ lines: [labor(10, 10, 74800)], quotedCents: 74800, warningPct })).warning;
    expect(at(10)).toBe("strong");
    expect(at(15)).toBe("below");
  });

  it("5% below is a warning, not strong", () => {
    const r = computeHourlyBaseline(input({ lines: [labor(10, 10, 80750)], quotedCents: 80750 }));
    expect(r.gapPct).toBe(-5);
    expect(r.warning).toBe("below");
  });
});
