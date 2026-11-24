import { describe, expect, it } from "vitest";
import {
  amountsLikelySame,
  classifyTrip,
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

  it("no longer matches a CSV trip to a photo by vendor, date and tax-adjusted amount alone (TASK-211)", () => {
    expect(findMatchingExpense(csv, [photo])).toBeNull();
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

describe("classifyTrip (TASK-211)", () => {
  const trip = {
    vendor_name: "The Home Depot",
    expense_date: "2026-09-08",
    amount_cents: 4996,
    external_ref: "3325",
    store_number: "3408",
  };
  const photo = {
    id: "photo-1",
    vendor_name: "Home Depot",
    expense_date: "2026-09-08",
    amount_cents: 5308,
    external_ref: null,
    source: null,
  };

  it("a new trip with full identity and nothing on file is new", () => {
    expect(classifyTrip(trip, [])).toEqual({ status: "new" });
  });

  it("store + date + amount without a shared transaction id is a review candidate, not a link (regression)", () => {
    expect(classifyTrip(trip, [photo])).toEqual({ status: "review", reason: "possible_duplicate", matchId: "photo-1" });
  });

  it("a receipt with the same supplier, date and transaction id links automatically", () => {
    expect(classifyTrip(trip, [{ ...photo, external_ref: "3325" }])).toEqual({ status: "auto_link", matchId: "photo-1" });
  });

  it("the same transaction again from a CSV import is already imported", () => {
    const prior = { ...trip, id: "csv-1", source: "home_depot_csv" };
    expect(classifyTrip(trip, [prior])).toEqual({ status: "already_imported", matchId: "csv-1" });
  });

  it("the same transaction id at another store is conflicting_transaction_id", () => {
    const other = { ...trip, id: "csv-2", store_number: "4719", source: "home_depot_csv" };
    expect(classifyTrip(trip, [other])).toMatchObject({ status: "review", reason: "conflicting_transaction_id" });
  });

  it("the same transaction id on another date, supplier or total is conflicting_transaction_id", () => {
    for (const change of [
      { expense_date: "2026-09-09" },
      { vendor_name: "Lowe's" },
      { amount_cents: 99_00 },
    ]) {
      const other = { ...photo, external_ref: "3325", ...change };
      expect(classifyTrip(trip, [other])).toMatchObject({ status: "review", reason: "conflicting_transaction_id" });
    }
  });

  it("two receipts that both fit are a review candidate, never a link", () => {
    expect(classifyTrip(trip, [photo, { ...photo, id: "photo-2" }])).toEqual({ status: "review", reason: "possible_duplicate" });
  });

  it("a trip without a store number or transaction id is never counted automatically", () => {
    expect(classifyTrip({ ...trip, store_number: null }, [])).toEqual({ status: "review", reason: "no_transaction_identity" });
    expect(classifyTrip({ ...trip, external_ref: null }, [])).toEqual({ status: "review", reason: "no_transaction_identity" });
  });
});
