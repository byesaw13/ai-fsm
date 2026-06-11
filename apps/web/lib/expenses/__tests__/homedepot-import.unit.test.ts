import { describe, it, expect } from "vitest";
import {
  parseDelimited,
  parseMoneyCents,
  parseQuantity,
  materialCategoryFor,
  parseHomeDepotCsv,
} from "../import/homedepot";

describe("parseDelimited", () => {
  it("handles quoted fields with embedded commas and quotes", () => {
    const rows = parseDelimited('a,"b,c","d ""e""",f\n1,2,3,4');
    expect(rows[0]).toEqual(["a", "b,c", 'd "e"', "f"]);
    expect(rows[1]).toEqual(["1", "2", "3", "4"]);
  });
  it("tolerates CRLF and a trailing newline", () => {
    expect(parseDelimited("x,y\r\n1,2\r\n")).toEqual([["x", "y"], ["1", "2"]]);
  });
});

describe("parseMoneyCents", () => {
  it("parses dollars, negatives, parens, and blanks", () => {
    expect(parseMoneyCents("$31.98")).toBe(3198);
    expect(parseMoneyCents("-$13.50")).toBe(-1350);
    expect(parseMoneyCents("($5.00)")).toBe(-500);
    expect(parseMoneyCents("$1,250.00")).toBe(125000);
    expect(parseMoneyCents("")).toBe(0);
    expect(parseMoneyCents(undefined)).toBe(0);
  });
});

describe("parseQuantity", () => {
  it("defaults blank/zero to 1 and reads numbers", () => {
    expect(parseQuantity("")).toBe(1);
    expect(parseQuantity("0")).toBe(1);
    expect(parseQuantity("3")).toBe(3);
  });
});

describe("materialCategoryFor", () => {
  it("maps HD departments to material categories", () => {
    expect(materialCategoryFor("PAINT", "Behr Ultra")).toBe("paint");
    expect(materialCategoryFor("LUMBER", "2x4x8 stud")).toBe("lumber");
    expect(materialCategoryFor("HARDWARE", "wood screws 100ct")).toBe("fasteners");
    expect(materialCategoryFor("PLUMBING", "PVC elbow")).toBe("hardware");
    expect(materialCategoryFor("GARDEN", "mulch")).toBe("other");
  });
});

const SAMPLE = `Company Name,DOVETAILS SERVICES LLC
Phone Number,978-476-2100
Source,Purchase Tracking
Date Range,05/10/24 to 06/10/26
Export Date,June 10 2026 11:39:37

Date,Store Number,Transaction ID,Register Number,Job Name,SKU Number,SKU Description,Quantity,Unit price,Department Name,Class Name,Subclass Name,Net Unit Price
2026-06-09,3408,3325,12,SWIFT LANE,1001,"12 in. x 12 in., Metal Access Door",1,$31.98,MILLWORK,Access,Panel,$31.98
2026-06-09,3408,3325,12,SWIFT LANE,1002,Return Air Grille,2,$8.99,HARDWARE,Grille,Steel,$8.99
2026-06-08,3408,917,5,41 golden gate,2001,Behr Ultra Paint 5 gal,1,$179.00,PAINT,Interior,Satin,$179.00
2026-06-07,3408,555,3,,3001,Returned Item,1,-$20.00,HARDWARE,x,y,-$20.00`;

describe("parseHomeDepotCsv", () => {
  it("skips the preamble, groups by transaction, sums line totals", () => {
    const { transactions, totalRows } = parseHomeDepotCsv(SAMPLE);
    expect(totalRows).toBe(4);
    expect(transactions).toHaveLength(3);

    const swift = transactions.find((t) => t.external_ref === "3325")!;
    expect(swift.vendor).toBe("The Home Depot");
    expect(swift.job_name).toBe("SWIFT LANE");
    // 3198*1 + 899*2 = 4996
    expect(swift.amount_cents).toBe(4996);
    expect(swift.line_items).toHaveLength(2);
    expect(swift.line_items[0].name).toBe("12 in. x 12 in., Metal Access Door"); // comma preserved
    expect(swift.is_return).toBe(false);
  });

  it("flags a net-negative trip as a return (not importable as an expense)", () => {
    const { transactions } = parseHomeDepotCsv(SAMPLE);
    const ret = transactions.find((t) => t.external_ref === "555")!;
    expect(ret.amount_cents).toBe(-2000);
    expect(ret.is_return).toBe(true);
    expect(ret.job_name).toBeNull();
  });

  it("derives material categories per line and sorts newest first", () => {
    const { transactions } = parseHomeDepotCsv(SAMPLE);
    expect(transactions[0].date >= transactions[transactions.length - 1].date).toBe(true);
    const paint = transactions.find((t) => t.external_ref === "917")!;
    expect(paint.line_items[0].category).toBe("paint");
    expect(paint.line_items[0].unit_cost_cents).toBe(17900);
  });

  it("throws on a non-Home-Depot CSV", () => {
    expect(() => parseHomeDepotCsv("foo,bar\n1,2")).toThrow(/Home Depot/);
  });
});
