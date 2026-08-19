import { describe, expect, it } from "vitest";
import {
  coerceGallons,
  gallonsFromParsedReceipt,
  isFuelExpenseCategory,
  parseGallonsFromFuelText,
} from "../fuel-from-receipt";

describe("isFuelExpenseCategory", () => {
  it("accepts fuel and vehicle_fuel", () => {
    expect(isFuelExpenseCategory("fuel")).toBe(true);
    expect(isFuelExpenseCategory("vehicle_fuel")).toBe(true);
    expect(isFuelExpenseCategory("materials")).toBe(false);
    expect(isFuelExpenseCategory(null)).toBe(false);
  });
});

describe("parseGallonsFromFuelText", () => {
  it("reads the Speedway receipt note", () => {
    expect(
      parseGallonsFromFuelText(
        "Regular unleaded fuel purchase, 23.707 gallons at $3.749/gal, $0.05/gal loyalty discount applied",
      ),
    ).toBe(23.707);
  });

  it("accepts gal shorthand", () => {
    expect(parseGallonsFromFuelText("14.2 gal")).toBe(14.2);
  });

  it("ignores missing or junk", () => {
    expect(parseGallonsFromFuelText(null)).toBeNull();
    expect(parseGallonsFromFuelText("Speedway pump 4")).toBeNull();
    expect(parseGallonsFromFuelText("600 gallons")).toBeNull();
  });
});

describe("gallonsFromParsedReceipt", () => {
  it("prefers the dedicated gallons field", () => {
    expect(
      gallonsFromParsedReceipt({
        gallons: 18.5,
        notes: "10 gallons leftover in notes",
      }),
    ).toBe(18.5);
  });

  it("falls back to notes, then a fuel line qty", () => {
    expect(gallonsFromParsedReceipt({ notes: "Filled 12.0 gal" })).toBe(12);
    expect(
      gallonsFromParsedReceipt({
        category: "fuel",
        line_items: [{ name: "UNLD REGULAR", quantity: 21.4 }],
      }),
    ).toBe(21.4);
  });

  it("does not treat qty 1 as a gallon fill", () => {
    expect(
      gallonsFromParsedReceipt({
        category: "fuel",
        line_items: [{ name: "UNLD", quantity: 1 }],
      }),
    ).toBeNull();
  });
});

describe("coerceGallons", () => {
  it("rounds to thousandths", () => {
    expect(coerceGallons(10.1234)).toBe(10.123);
    expect(coerceGallons("9.5")).toBe(9.5);
    expect(coerceGallons(0)).toBeNull();
  });
});
