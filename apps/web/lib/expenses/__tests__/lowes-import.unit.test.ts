import { describe, it, expect } from "vitest";
import { parseLowesCsv, looksLikeLowesCsv } from "../import/lowes";
import { parsePurchaseCsv } from "../import/detect";
import { parseDateISO } from "../import/csv-shared";

describe("parseDateISO", () => {
  it("parses ISO and US dates", () => {
    expect(parseDateISO("2026-06-09")).toBe("2026-06-09");
    expect(parseDateISO("06/09/2026")).toBe("2026-06-09");
    expect(parseDateISO("6/9/26")).toBe("2026-06-09");
  });
});

const LOWES_PRO_SAMPLE = `Purchase Date,Store Number,Invoice Number,PO Number,Item Number,Item Description,Quantity,Unit Cost,Extended Cost,Department
06/09/2026,1850,INV-99101,J260029,1234567,"2x4x8 Stud, SPF",10,$3.98,$39.80,Lumber
06/09/2026,1850,INV-99101,J260029,7654321,Wood Screws 1 lb,2,$8.47,$16.94,Hardware
06/08/2026,1850,INV-99002,,5551212,Interior Paint Gal,1,$42.98,$42.98,Paint
06/07/2026,1850,INV-98999,,9990001,Returned hinge,1,-$5.00,-$5.00,Hardware
`;

const LOWES_ORDERS_SAMPLE = `Order Date,Order Number,Product Name,Quantity,Price,Total
2026-05-01,LW-100,Caulk Silicone,3,6.98,20.94
2026-05-01,LW-100,Painter Tape,1,9.48,9.48
`;

describe("looksLikeLowesCsv", () => {
  it("recognizes Pro-style headers", () => {
    const header = LOWES_PRO_SAMPLE.trim().split("\n")[0].split(",");
    expect(looksLikeLowesCsv(header)).toBe(true);
  });

  it("rejects generic bank/expense CSVs", () => {
    expect(looksLikeLowesCsv(["Date", "Description", "Amount"])).toBe(false);
    expect(looksLikeLowesCsv(["Date", "Memo", "Debit", "Credit"])).toBe(false);
  });
});

describe("parseLowesCsv", () => {
  it("groups by invoice, sums extended, maps PO and SKUs", () => {
    const { transactions, totalRows } = parseLowesCsv(LOWES_PRO_SAMPLE);
    expect(totalRows).toBe(4);
    expect(transactions).toHaveLength(3);

    const inv = transactions.find((t) => t.external_ref === "INV-99101")!;
    expect(inv.vendor).toBe("Lowe's");
    expect(inv.job_name).toBe("J260029");
    expect(inv.amount_cents).toBe(3980 + 1694);
    expect(inv.line_items).toHaveLength(2);
    expect(inv.line_items[0].sku).toBe("1234567");
    expect(inv.line_items[0].name).toContain("2x4x8");
    expect(inv.is_return).toBe(false);
  });

  it("flags credits as returns", () => {
    const { transactions } = parseLowesCsv(LOWES_PRO_SAMPLE);
    const ret = transactions.find((t) => t.external_ref === "INV-98999")!;
    expect(ret.is_return).toBe(true);
  });

  it("parses order-style exports", () => {
    const { transactions } = parseLowesCsv(LOWES_ORDERS_SAMPLE);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].external_ref).toBe("LW-100");
    expect(transactions[0].amount_cents).toBe(2094 + 948);
    expect(transactions[0].line_items).toHaveLength(2);
  });
});

describe("parsePurchaseCsv detect", () => {
  it("detects Lowe's", () => {
    const r = parsePurchaseCsv(LOWES_PRO_SAMPLE);
    expect(r.source).toBe("lowes_csv");
    expect(r.vendor_label).toBe("Lowe's");
    expect(r.transactions.length).toBeGreaterThan(0);
  });

  it("still detects Home Depot", () => {
    const hd = `Export Date,x

Date,Transaction ID,Job Name,SKU Number,SKU Description,Quantity,Department Name,Net Unit Price
2026-06-01,800,LASKY,111,Regular Paint,1,PAINT,$40.00
`;
    const r = parsePurchaseCsv(hd);
    expect(r.source).toBe("home_depot_csv");
    expect(r.transactions[0].vendor).toBe("The Home Depot");
  });
});
