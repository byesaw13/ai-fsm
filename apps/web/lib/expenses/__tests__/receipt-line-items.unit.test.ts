import { describe, expect, it } from "vitest";
import {
  coerceUnitCostCents,
  normalizeParsedReceiptLineItems,
  reconcileReceiptParse,
  getReceiptParseModel,
  DEFAULT_RECEIPT_PARSE_MODEL,
} from "../receipt-line-items";

describe("coerceUnitCostCents", () => {
  it("keeps correct unit when product matches line total", () => {
    expect(
      coerceUnitCostCents({ quantity: 3, unit_cost_cents: 1000, line_total_cents: 3000 }),
    ).toBe(1000);
  });

  it("fixes unit when model put line total in unit_cost with qty > 1", () => {
    // 3 @ $10 → model returned unit=$30 (line total)
    expect(
      coerceUnitCostCents({ quantity: 3, unit_cost_cents: 3000, line_total_cents: 3000 }),
    ).toBe(1000);
  });

  it("derives unit from line total when unit is inconsistent with qty", () => {
    // model: unit $15 (wrong), total $30, qty 3 → $10 each
    expect(
      coerceUnitCostCents({ quantity: 3, unit_cost_cents: 1500, line_total_cents: 3000 }),
    ).toBe(1000);
  });

  it("uses line total as unit when qty is 1 and they disagree", () => {
    expect(
      coerceUnitCostCents({ quantity: 1, unit_cost_cents: 999, line_total_cents: 1048 }),
    ).toBe(1048);
  });

  it("leaves unit alone when no line total is provided", () => {
    expect(coerceUnitCostCents({ quantity: 3, unit_cost_cents: 1000 })).toBe(1000);
  });
});

describe("normalizeParsedReceiptLineItems", () => {
  it("corrects the classic 3×$10 → single $30 bug", () => {
    const rows = normalizeParsedReceiptLineItems([
      {
        name: "2x4 Stud",
        quantity: 3,
        unit_cost_cents: 3000,
        line_total_cents: 3000,
        sku: "123",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].unit_cost_cents).toBe(1000);
    expect(rows[0].line_total_cents).toBe(3000);
  });

  it("preserves correct multi-qty parse", () => {
    const rows = normalizeParsedReceiptLineItems([
      {
        name: "2x4 Stud",
        quantity: 3,
        unit_cost_cents: 1000,
        line_total_cents: 3000,
      },
    ]);
    expect(rows[0].unit_cost_cents).toBe(1000);
    expect(rows[0].quantity).toBe(3);
  });

  it("derives unit from line total when unit is missing", () => {
    const rows = normalizeParsedReceiptLineItems([
      {
        name: "Screw box",
        quantity: 2,
        unit_cost_cents: 0 as unknown as number,
        line_total_cents: 1598,
      },
    ]);
    // unit_cost 0 is treated as missing → derive 799
    expect(rows[0].unit_cost_cents).toBe(799);
    expect(rows[0].quantity).toBe(2);
  });

  it("defaults quantity to 1 and fills line_total when omitted", () => {
    const rows = normalizeParsedReceiptLineItems([
      { name: "Caulk", quantity: 0 as unknown as number, unit_cost_cents: 848 },
    ]);
    expect(rows[0].quantity).toBe(1);
    expect(rows[0].unit_cost_cents).toBe(848);
    expect(rows[0].line_total_cents).toBe(848);
  });

  it("drops blank names and non-positive prices", () => {
    expect(
      normalizeParsedReceiptLineItems([
        { name: "  ", quantity: 1, unit_cost_cents: 100 },
        { name: "Ok", quantity: 1, unit_cost_cents: 0 },
      ]),
    ).toEqual([]);
  });

  it("strips money-looking SKUs", () => {
    const rows = normalizeParsedReceiptLineItems([
      { name: "Nail", quantity: 1, unit_cost_cents: 500, sku: "$5.00" },
    ]);
    expect(rows[0].sku).toBeNull();
  });
});

describe("reconcileReceiptParse", () => {
  it("marks balanced when lines sum near total", () => {
    const r = reconcileReceiptParse(
      [
        { name: "a", quantity: 2, unit_cost_cents: 1000, line_total_cents: 2000 },
        { name: "b", quantity: 1, unit_cost_cents: 500, line_total_cents: 500 },
      ],
      2500,
    );
    expect(r.line_items_subtotal_cents).toBe(2500);
    expect(r.balanced).toBe(true);
    expect(r.delta_cents).toBe(0);
  });

  it("uses pre-tax target when tax is provided", () => {
    const r = reconcileReceiptParse(
      [{ name: "a", quantity: 1, unit_cost_cents: 1000, line_total_cents: 1000 }],
      1080,
      80,
    );
    expect(r.balanced).toBe(true);
    expect(r.delta_cents).toBe(0);
  });

  it("flags unbalanced when gap is large", () => {
    const r = reconcileReceiptParse(
      [{ name: "a", quantity: 1, unit_cost_cents: 1000, line_total_cents: 1000 }],
      5000,
    );
    expect(r.balanced).toBe(false);
  });
});

describe("getReceiptParseModel", () => {
  it("defaults to Sonnet for precision", () => {
    const prev = process.env.RECEIPT_PARSE_MODEL;
    delete process.env.RECEIPT_PARSE_MODEL;
    expect(getReceiptParseModel()).toBe(DEFAULT_RECEIPT_PARSE_MODEL);
    if (prev !== undefined) process.env.RECEIPT_PARSE_MODEL = prev;
  });

  it("honors RECEIPT_PARSE_MODEL override", () => {
    const prev = process.env.RECEIPT_PARSE_MODEL;
    process.env.RECEIPT_PARSE_MODEL = "claude-haiku-4-5-20251001";
    expect(getReceiptParseModel()).toBe("claude-haiku-4-5-20251001");
    if (prev !== undefined) process.env.RECEIPT_PARSE_MODEL = prev;
    else delete process.env.RECEIPT_PARSE_MODEL;
  });
});
