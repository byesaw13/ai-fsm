import { describe, expect, it } from "vitest";
import {
  coerceGallons,
  gallonsFromParsedReceipt,
  isFuelExpenseCategory,
  odometerOutOfHistory,
  parseGallonsFromFuelText,
  pickOdometerForFuelDay,
  reviewFuelReceipt,
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

  it("does not treat pump $/gal as gallons", () => {
    expect(
      parseGallonsFromFuelText(
        "Regular fuel fill-up, pump 7, 3.909 gallons at $3.909/gal, loyalty discount",
      ),
    ).toBeNull();
  });
});

describe("reviewFuelReceipt", () => {
  it("corrects gallons that match the pump price using the receipt total", () => {
    const review = reviewFuelReceipt({
      gallons: 3.909,
      amountCents: 9330,
      notes: "3.909 gallons at $3.909/gal",
    });
    expect(review.gallonsLooksLikePrice).toBe(true);
    expect(review.impliedGallons).toBe(23.868);
    expect(review.warnings.length).toBeGreaterThan(0);
  });

  it("is quiet when gallons match the total", () => {
    const review = reviewFuelReceipt({
      gallons: 23.707,
      amountCents: 8888,
      notes: "23.707 gallons at $3.749/gal",
    });
    expect(review.gallonsLooksLikePrice).toBe(false);
    expect(review.warnings).toEqual([]);
  });
});

describe("pickOdometerForFuelDay", () => {
  it("prefers that day's start, then the previous day's close", () => {
    expect(
      pickOdometerForFuelDay({ sameDayStart: 109600, previousDayEnd: 109792 }),
    ).toEqual({ odometer: 109600, source: "same_day_start" });
    expect(
      pickOdometerForFuelDay({ sameDayStart: null, previousDayEnd: 110156 }),
    ).toEqual({ odometer: 110156, source: "previous_day_end" });
    expect(pickOdometerForFuelDay({ sameDayStart: null, previousDayEnd: null })).toBeNull();
  });
});

describe("odometerOutOfHistory", () => {
  it("flags a reading that jumps past the next fill", () => {
    expect(
      odometerOutOfHistory({ odometer: 111000, priorOdometer: 109375, nextOdometer: 109920 }),
    ).toBe(true);
    expect(
      odometerOutOfHistory({ odometer: 109600, priorOdometer: 109375, nextOdometer: 109920 }),
    ).toBe(false);
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

  it("replaces OCR gallons that equal the pump price using the receipt total", () => {
    expect(
      gallonsFromParsedReceipt({
        gallons: 3.909,
        amountCents: 9330,
        notes: "3.909 gallons at $3.909/gal",
      }),
    ).toBe(23.868);
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
