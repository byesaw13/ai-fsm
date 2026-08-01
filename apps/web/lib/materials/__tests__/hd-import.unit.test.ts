import { describe, expect, it } from "vitest";
import { mapHdDepartmentToCategory, parseHomeDepotPurchaseCsv } from "../hd-import";

describe("mapHdDepartmentToCategory", () => {
  it("maps common departments", () => {
    expect(mapHdDepartmentToCategory("PAINT")).toBe("paint");
    expect(mapHdDepartmentToCategory("HARDWARE")).toBe("hardware");
    expect(mapHdDepartmentToCategory("MILLWORK")).toBe("trim");
    expect(mapHdDepartmentToCategory("UNKNOWN DEPT")).toBe("other");
  });
});

describe("parseHomeDepotPurchaseCsv", () => {
  const sample = `Company Name,DOVETAILS SERVICES LLC
Source,Purchase Tracking

Date,Store Number,Transaction ID,Register Number,Job Name,SKU Number,SKU Description,Quantity,Unit price,Department Name,Class Name,Subclass Name,Program Discount Amount,Program Discount Indicator,Other Discount Amount,Extended Retail (before discount),Net Unit Price,Internet SKU,Purchaser,Order Number,Invoice Number
2026-06-09,3401,3325,0,SWIFT LANE,1006765300,DW Series Access Door,1,,PLUMBING,PIPE,,,,$0.00,$31.98,$31.98,202528344,Nicolas,,6184746
2026-06-09,3401,3325,0,SWIFT LANE,1011001384,Access Panel,1,,PLUMBING,PIPE,,,,$0.00,-$13.50,-$13.50,328818578,Nicolas,,6184746
2026-06-09,3401,917,0,36 SWIFT,585149,Floor Mount Guide,1,,HARDWARE,BUILDER'S HARDWARE,,,,$0.00,$5.95,$5.95,100199762,Nicolas,,6354626
`;

  it("parses positive lines and skips returns", () => {
    const { lines, skipped } = parseHomeDepotPurchaseCsv(sample);
    expect(lines).toHaveLength(2);
    expect(lines[0].sku).toBe("1006765300");
    expect(lines[0].unit_cost_cents).toBe(3198);
    expect(lines[0].purchasedAt).toBe("2026-06-09");
    expect(lines[0].supplier).toBe("Home Depot");
    expect(lines[1].unit_cost_cents).toBe(595);

    expect(skipped.some((s) => s.reason.includes("return"))).toBe(true);
  });

  it("coerces net unit when HD copies line total into net unit for multi-qty", () => {
    // qty 3, net=$30, extended=$30 → true unit is $10
    const multi = `Date,SKU Number,SKU Description,Quantity,Department Name,Extended Retail (before discount),Net Unit Price
2026-06-09,999,Three Pack Widget,3,HARDWARE,$30.00,$30.00
`;
    const { lines } = parseHomeDepotPurchaseCsv(multi);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    expect(lines[0].unit_cost_cents).toBe(1000);
  });

  it("keeps correct multi-qty unit when extended = qty × net", () => {
    const multi = `Date,SKU Number,SKU Description,Quantity,Department Name,Extended Retail (before discount),Net Unit Price
2026-06-09,999,Three Pack Widget,3,HARDWARE,$30.00,$10.00
`;
    const { lines } = parseHomeDepotPurchaseCsv(multi);
    expect(lines[0].unit_cost_cents).toBe(1000);
    expect(lines[0].quantity).toBe(3);
  });

  it("reports missing header", () => {
    const { lines, skipped } = parseHomeDepotPurchaseCsv("not a real csv\n1,2,3\n");
    expect(lines).toHaveLength(0);
    expect(skipped[0].reason).toMatch(/header/i);
  });
});
