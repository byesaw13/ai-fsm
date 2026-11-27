import { describe, expect, it } from "vitest";
import {
  coerceUnitCostCents,
  normalizeParsedReceiptLineItems,
  reconcileReceiptParse,
  getReceiptParseModel,
  DEFAULT_RECEIPT_PARSE_MODEL,
  receiptAdjustmentsFrom,
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
    process.env.RECEIPT_PARSE_MODEL = "claude-haiku-5-5";
    expect(getReceiptParseModel()).toBe("claude-haiku-5-5");
    if (prev !== undefined) process.env.RECEIPT_PARSE_MODEL = prev;
    else delete process.env.RECEIPT_PARSE_MODEL;
  });
});

describe("signed adjustments and reconciliation (TASK-211, D11-8)", () => {
  it("keeps a returned line as a negative return adjustment, never a price", () => {
    const raw = [
      { name: "Paint 1 gal", quantity: 1, unit_cost_cents: 4298, line_total_cents: 4298 },
      { name: "RETURN caulk", quantity: -1, unit_cost_cents: 547, line_total_cents: -547 },
      { name: "RETURN tape", quantity: 1, unit_cost_cents: -698 },
    ];
    expect(normalizeParsedReceiptLineItems(raw).map((l) => l.name)).toEqual(["Paint 1 gal"]);
    expect(receiptAdjustmentsFrom(raw, [])).toEqual([
      { kind: "return", name: "RETURN caulk", amount_cents: -547 },
      { kind: "return", name: "RETURN tape", amount_cents: -698 },
    ]);
  });

  it("signs receipt-level discounts and coupons negative whatever the model returned", () => {
    expect(
      receiptAdjustmentsFrom([], [
        { kind: "discount", name: "PRO XTRA 5%", amount_cents: 215 },
        { kind: "coupon", name: "MFR COUPON", amount_cents: -100 },
        { kind: "discount", name: "zero", amount_cents: 0 },
      ]),
    ).toEqual([
      { kind: "discount", name: "PRO XTRA 5%", amount_cents: -215 },
      { kind: "coupon", name: "MFR COUPON", amount_cents: -100 },
    ]);
  });

  it("a receipt that balances once tax, discounts and returns are applied is reconciled", () => {
    const lines = [
      { name: "Paint", quantity: 2, unit_cost_cents: 4298, line_total_cents: 8596 },
      { name: "Tape", quantity: 1, unit_cost_cents: 698, line_total_cents: 698 },
    ];
    const adjustments = [
      { kind: "return" as const, name: "RETURN caulk", amount_cents: -547 },
      { kind: "coupon" as const, name: "COUPON", amount_cents: -500 },
    ];
    // (8596 + 698 - 547 - 500) = 8247 merchandise, + 6.25% tax 515 = 8762
    const r = reconcileReceiptParse(lines, 8762, 515, adjustments);
    expect(r.adjustments_cents).toBe(-1047);
    expect(r.delta_cents).toBe(0);
    expect(r.balanced).toBe(true);
    // Without the adjustments the same receipt does not add up.
    expect(reconcileReceiptParse(lines, 8762, 515).balanced).toBe(false);
  });

  it("net line prices are never discounted twice", () => {
    // The line's unit price already includes its $2 line discount; no adjustment repeats it.
    const r = reconcileReceiptParse([{ name: "Saw blade", quantity: 1, unit_cost_cents: 1798 }], 1798, null, []);
    expect(r.balanced).toBe(true);
  });

  it("only an unexplained mismatch is unreconciled", () => {
    const r = reconcileReceiptParse([{ name: "Lumber", quantity: 1, unit_cost_cents: 5000 }], 9000, null, []);
    expect(r.balanced).toBe(false);
    expect(r.delta_cents).toBe(4000);
  });
});
