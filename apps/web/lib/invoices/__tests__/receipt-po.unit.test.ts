import { describe, it, expect } from "vitest";
import { extractReceiptPo, receiptMatchesPoQuery } from "../receipt-po";

describe("extractReceiptPo", () => {
  it("returns null for empty notes", () => {
    expect(extractReceiptPo(null)).toBeNull();
    expect(extractReceiptPo("")).toBeNull();
    expect(extractReceiptPo("   ")).toBeNull();
  });

  it("extracts explicit PO markers", () => {
    expect(extractReceiptPo("Materials for PO 12345")).toBe("12345");
    expect(extractReceiptPo("PO#ABC-1 lumber run")).toBe("ABC-1");
    expect(extractReceiptPo("P.O. 99")).toBe("99");
  });

  it("extracts Home Depot job tags from import notes", () => {
    expect(extractReceiptPo("Home Depot · SWIFT LANE")).toBe("SWIFT LANE");
    expect(extractReceiptPo("Home Depot · 36 SWIFT → Front door repair")).toBe("36 SWIFT");
  });

  it("extracts Job/Project labels", () => {
    expect(extractReceiptPo("Job Name: Barn doors")).toBe("Barn doors");
    expect(extractReceiptPo("Project: kitchen paint")).toBe("kitchen paint");
  });

  it("returns null when nothing matches", () => {
    expect(extractReceiptPo("Picked up screws and glue")).toBeNull();
  });
});

describe("receiptMatchesPoQuery", () => {
  const base = {
    vendor_name: "Home Depot",
    notes: "Home Depot · SWIFT LANE → Front door",
  };

  it("matches empty query as true", () => {
    expect(receiptMatchesPoQuery(base, "")).toBe(true);
    expect(receiptMatchesPoQuery(base, "  ")).toBe(true);
  });

  it("matches extracted PO tag", () => {
    expect(receiptMatchesPoQuery(base, "swift")).toBe(true);
    expect(receiptMatchesPoQuery({ vendor_name: "Lowes", notes: "PO 12345" }, "123")).toBe(true);
  });

  it("matches vendor name", () => {
    expect(receiptMatchesPoQuery(base, "depot")).toBe(true);
  });

  it("matches freeform notes", () => {
    expect(receiptMatchesPoQuery(base, "front door")).toBe(true);
  });

  it("returns false when nothing matches", () => {
    expect(receiptMatchesPoQuery(base, "barn")).toBe(false);
  });
});
