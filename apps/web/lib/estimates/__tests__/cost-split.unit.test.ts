import { describe, expect, it } from "vitest";
import {
  defaultMaterialPrice,
  materialMarkupPct,
  markupLabel,
  splitInternalCosts,
  type CostSplitLine,
} from "../cost-split";

/** Fixture A quote lines: midpoint hours at $85/h, materials at cost. */
const FIXTURE_A_HOURS = [12.5, 16.75, 2.5, 10, 9, 8.5, 16, 35];
const FIXTURE_A_MATERIALS = [30_000, 29_500, 22_500, 63_000];
const RATES = { billingCents: 8_500, costCents: 5_000 };

function fixtureALines(): CostSplitLine[] {
  const labor = FIXTURE_A_HOURS.map((hours) => ({
    line_item_type: "labor",
    quantity: hours,
    unit_price_cents: 8_500,
    unit_cost_cents: null,
    hours_high: hours,
  }));
  const materials = FIXTURE_A_MATERIALS.map((cents) => ({
    line_item_type: "materials",
    quantity: 1,
    unit_price_cents: cents,
    unit_cost_cents: cents,
  }));
  return [...labor, ...materials];
}

describe("splitInternalCosts", () => {
  it("books Fixture A labor and materials apart", () => {
    const split = splitInternalCosts(fixtureALines(), RATES);
    expect(split.laborCostCents).toBe(551_250);
    expect(split.materialCostCents).toBe(145_000);
  });

  it("uses price ÷ billing × cost when a labor line has no hours", () => {
    const split = splitInternalCosts(
      [{ line_item_type: "labor", quantity: 2, unit_price_cents: 8_500, unit_cost_cents: null }],
      RATES,
    );
    expect(split.laborCostCents).toBe(10_000);
    expect(split.materialCostCents).toBe(0);
  });

  it("counts a materials line at its cost, not its price", () => {
    const split = splitInternalCosts(
      [{ line_item_type: "materials", quantity: 1, unit_price_cents: 24_000, unit_cost_cents: 20_000 }],
      RATES,
    );
    expect(split.materialCostCents).toBe(20_000);
    expect(split.laborCostCents).toBe(0);
  });

  it("keeps a $120 equipment line out of materials cost and still counts that cost in the margin", () => {
    const materials = splitInternalCosts(
      [{ line_item_type: "materials", quantity: 1, unit_price_cents: 10_000, unit_cost_cents: 10_000 }],
      RATES,
    );
    const split = splitInternalCosts(
      [
        { line_item_type: "materials", quantity: 1, unit_price_cents: 10_000, unit_cost_cents: 10_000 },
        { line_item_type: "equipment", quantity: 1, unit_price_cents: 12_000, unit_cost_cents: 12_000 },
      ],
      RATES,
    );
    expect(split.materialCostCents).toBe(materials.materialCostCents);
    expect(split.equipmentCostCents).toBe(12_000);
    expect(split.laborCostCents).toBe(0);
    expect(split.marginPct).toBeCloseTo((10_000 + 12_000 - 10_000 - 12_000) / (10_000 + 12_000), 10);
  });

  it("leaves a materials line with no cost out of materials cost", () => {
    const split = splitInternalCosts(
      [{ line_item_type: "materials", quantity: 1, unit_price_cents: 24_000, unit_cost_cents: null }],
      RATES,
    );
    expect(split.materialCostCents).toBe(0);
  });

  it("a handling-fee line changes neither cost", () => {
    const withHandling = [
      ...fixtureALines(),
      { line_item_type: "handling_fee", quantity: 1, unit_price_cents: 21_750, unit_cost_cents: null },
    ];
    const plain = splitInternalCosts(fixtureALines(), RATES);
    const handled = splitInternalCosts(withHandling, RATES);
    expect(handled.laborCostCents).toBe(plain.laborCostCents);
    expect(handled.materialCostCents).toBe(plain.materialCostCents);
  });

  it("an adjustment line, including travel, changes neither cost", () => {
    const lines: CostSplitLine[] = [
      { line_item_type: "labor", quantity: 1, unit_price_cents: 8_500, unit_cost_cents: null, hours_high: 1 },
      { line_item_type: "adjustment", quantity: 1, unit_price_cents: 4_000, unit_cost_cents: null },
      {
        line_item_type: "adjustment",
        quantity: 1,
        unit_price_cents: 2_500,
        unit_cost_cents: null,
        adjustment_type: "travel_surcharge",
      },
    ];
    const split = splitInternalCosts(lines, RATES);
    expect(split.laborCostCents).toBe(5_000);
    expect(split.materialCostCents).toBe(0);
  });

  it("margin uses the lines on the quote and does not invent handling revenue", () => {
    const lines = fixtureALines();
    const split = splitInternalCosts(lines, RATES);
    const revenue = 1_082_125;
    const cost = 551_250 + 145_000;
    expect(split.marginPct).toBeCloseTo((revenue - cost) / revenue, 10);
    const phantomRevenue = revenue + Math.round(145_000 * 0.15);
    expect(split.marginPct).not.toBeCloseTo((phantomRevenue - cost) / phantomRevenue, 6);
  });

  it("includes a handling line that is actually on the quote", () => {
    const lines = [
      ...fixtureALines(),
      { line_item_type: "handling_fee", quantity: 1, unit_price_cents: 21_750, unit_cost_cents: null },
    ];
    const split = splitInternalCosts(lines, RATES);
    const revenue = 1_082_125 + 21_750;
    const cost = 551_250 + 145_000;
    expect(split.marginPct).toBeCloseTo((revenue - cost) / revenue, 10);
  });
});

describe("materialMarkupPct", () => {
  it("is 20 when cost is $200 and price is $240", () => {
    expect(materialMarkupPct({ unit_price_cents: 24_000, unit_cost_cents: 20_000 })).toBe(20);
    expect(markupLabel({ unit_price_cents: 24_000, unit_cost_cents: 20_000 })).toBe("marked up 20%");
  });

  it("is null when cost is missing, zero, or the price is not above cost", () => {
    expect(materialMarkupPct({ unit_price_cents: 24_000, unit_cost_cents: null })).toBeNull();
    expect(materialMarkupPct({ unit_price_cents: 24_000, unit_cost_cents: 0 })).toBeNull();
    expect(materialMarkupPct({ unit_price_cents: 20_000, unit_cost_cents: 20_000 })).toBeNull();
    expect(materialMarkupPct({ unit_price_cents: 15_000, unit_cost_cents: 20_000 })).toBeNull();
  });
});

describe("defaultMaterialPrice", () => {
  it("sets a materials price to its cost when only the cost was entered", () => {
    expect(defaultMaterialPrice({
      line_item_type: "materials",
      unit_cost_cents: 20_000,
    }).unit_price_cents).toBe(20_000);
  });

  it("keeps a price the owner entered", () => {
    expect(defaultMaterialPrice({
      line_item_type: "materials",
      unit_price_cents: 24_000,
      unit_cost_cents: 20_000,
    }).unit_price_cents).toBe(24_000);
  });
});
