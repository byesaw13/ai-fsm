import { describe, expect, it } from "vitest";
import {
  amountsLikelySame,
  csvImportStatus,
  findMatchingExpense,
  normalizeTxnId,
  vendorFamily,
} from "../duplicate-match";

describe("vendorFamily", () => {
  it("collapses Home Depot store labels", () => {
    expect(vendorFamily("The Home Depot")).toBe("home_depot");
    expect(vendorFamily("HOME DEPOT #3408")).toBe("home_depot");
    expect(vendorFamily("Home Depot")).toBe("home_depot");
  });

  it("collapses Lowe's labels", () => {
    expect(vendorFamily("Lowe's")).toBe("lowes");
    expect(vendorFamily("Lowes")).toBe("lowes");
  });
});

describe("normalizeTxnId", () => {
  it("strips punctuation and case", () => {
    expect(normalizeTxnId("3325")).toBe("3325");
    expect(normalizeTxnId("  0512-3325  ")).toBe("05123325");
    expect(normalizeTxnId(null)).toBe(null);
    expect(normalizeTxnId("")).toBe(null);
  });
});

describe("amountsLikelySame", () => {
  it("matches exact cents", () => {
    expect(amountsLikelySame(4996, 4996)).toBe(true);
  });

  it("matches CSV merchandise plus MA tax to the receipt total", () => {
    const csv = 4996;
    const withTax = Math.round(csv * 1.0625);
    expect(withTax).toBe(5308);
    expect(amountsLikelySame(csv, withTax)).toBe(true);
  });

  it("does not match unrelated totals", () => {
    expect(amountsLikelySame(4996, 8800)).toBe(false);
  });
});

describe("findMatchingExpense", () => {
  const photo = {
    id: "photo-1",
    vendor_name: "Home Depot",
    expense_date: "2026-09-08",
    amount_cents: 5308,
    external_ref: null,
  };
  const csv = {
    vendor_name: "The Home Depot",
    expense_date: "2026-09-08",
    amount_cents: 4996,
    external_ref: "3325",
  };

  it("matches a CSV trip to a photo by vendor, date, and tax-adjusted amount", () => {
    expect(findMatchingExpense(csv, [photo])?.id).toBe("photo-1");
  });

  it("matches by transaction id even when amounts differ", () => {
    const existing = { ...photo, external_ref: "3325", amount_cents: 100 };
    expect(findMatchingExpense(csv, [existing])?.id).toBe("photo-1");
  });

  it("does not match when both sides have different transaction ids", () => {
    const existing = { ...photo, external_ref: "9999" };
    expect(findMatchingExpense(csv, [existing])).toBeNull();
  });

  it("does not match the same transaction id at a different store", () => {
    expect(
      findMatchingExpense(csv, [{
        id: "lowes-1",
        vendor_name: "Lowe's",
        expense_date: "2026-09-08",
        amount_cents: 4996,
        external_ref: "3325",
        source: "lowes_csv",
      }]),
    ).toBeNull();
  });

  it("returns null when two existing rows both fit (ambiguous)", () => {
    const other = { ...photo, id: "photo-2" };
    expect(findMatchingExpense(csv, [photo, other])).toBeNull();
  });

  it("does not match a different day", () => {
    expect(
      findMatchingExpense(csv, [{ ...photo, expense_date: "2026-09-09" }]),
    ).toBeNull();
  });
});

describe("csvImportStatus", () => {
  it("marks a prior CSV of the same transaction as already imported", () => {
    expect(
      csvImportStatus(
        {
          vendor_name: "The Home Depot",
          expense_date: "2026-09-08",
          amount_cents: 4996,
          external_ref: "3325",
        },
        [{
          id: "csv-1",
          vendor_name: "The Home Depot",
          expense_date: "2026-09-08",
          amount_cents: 4996,
          external_ref: "3325",
          source: "home_depot_csv",
        }],
      ),
    ).toBe("already_imported");
  });

  it("treats an OCR-stamped photo as matched receipt, not already imported", () => {
    expect(
      csvImportStatus(
        {
          vendor_name: "The Home Depot",
          expense_date: "2026-09-08",
          amount_cents: 4996,
          external_ref: "3325",
        },
        [{
          id: "photo-1",
          vendor_name: "Home Depot",
          expense_date: "2026-09-08",
          amount_cents: 5308,
          external_ref: "3325",
          source: null,
        }],
      ),
    ).toBe("matched_receipt");
  });

  it("marks a photo of the same trip as matched receipt (still import to merge)", () => {
    expect(
      csvImportStatus(
        {
          vendor_name: "The Home Depot",
          expense_date: "2026-09-08",
          amount_cents: 4996,
          external_ref: "3325",
        },
        [{
          id: "photo-1",
          vendor_name: "Home Depot",
          expense_date: "2026-09-08",
          amount_cents: 5308,
          external_ref: null,
        }],
      ),
    ).toBe("matched_receipt");
  });
});
