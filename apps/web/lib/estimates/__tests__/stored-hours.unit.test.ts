import { describe, expect, it } from "vitest";
import {
  formHourColumns,
  hoursAreMissing,
  leastCertainHourSource,
  lineHourColumns,
  priceBookHourRange,
  quickEstimateCanSend,
  storedHour,
  storedHourRange,
  storedHourSource,
  travelTimeHours,
  withHourEdit,
} from "../stored-hours";

describe("storedHour", () => {
  it("keeps a blank hour missing instead of zero", () => {
    expect(storedHour(null)).toBeNull();
    expect(storedHour(undefined)).toBeNull();
  });

  it("keeps an entered hour", () => {
    expect(storedHour(0)).toBe(0);
    expect(storedHour(2.5)).toBe(2.5);
  });

  it("rejects a negative hour", () => {
    expect(() => storedHour(-1)).toThrow(/zero or more/);
  });
});

describe("storedHourRange", () => {
  it("keeps a low and high pair", () => {
    expect(storedHourRange(6, 8)).toEqual({ low: 6, high: 8 });
  });

  it("allows one side to be missing", () => {
    expect(storedHourRange(null, 8)).toEqual({ low: null, high: 8 });
    expect(storedHourRange(6, null)).toEqual({ low: 6, high: null });
  });

  it("rejects a low above the high", () => {
    expect(() => storedHourRange(8, 6)).toThrow(/low cannot be above high/);
  });
});

describe("storedHourSource", () => {
  it("keeps a known source and drops a blank one", () => {
    expect(storedHourSource("price_book")).toBe("price_book");
    expect(storedHourSource("travel_calc")).toBe("travel_calc");
    expect(storedHourSource(null)).toBeNull();
    expect(storedHourSource(undefined)).toBeNull();
  });

  it("rejects an unknown source", () => {
    expect(() => storedHourSource("guess")).toThrow(/source/);
  });
});

describe("lineHourColumns", () => {
  it("drops a source when both hours are blank", () => {
    expect(lineHourColumns({ hours_source: "owner" })).toEqual({
      hours_low: null,
      hours_high: null,
      hours_source: null,
    });
  });

  it("keeps a range and its source", () => {
    expect(lineHourColumns({ hours_low: 6, hours_high: 8, hours_source: "ai_allowance" })).toEqual({
      hours_low: 6,
      hours_high: 8,
      hours_source: "ai_allowance",
    });
  });
});

describe("person-hour helpers", () => {
  it("picks the least certain source in a group", () => {
    expect(leastCertainHourSource(["owner", "price_book", "ai_allowance"])).toBe("ai_allowance");
    expect(leastCertainHourSource(["owner", "revision"])).toBe("revision");
    expect(leastCertainHourSource([null, ""])).toBeNull();
  });

  it("starts a price-book line at its typical hours", () => {
    expect(priceBookHourRange({ labor_hours_typical: 2 })).toEqual({
      hours_low: 2,
      hours_high: 2,
      hours_source: "price_book",
    });
    expect(priceBookHourRange({ labor_hours_low: 1, labor_hours_high: 3, labor_hours_typical: 2 })).toEqual({
      hours_low: 1,
      hours_high: 3,
      hours_source: "price_book",
    });
    expect(priceBookHourRange({})).toBeNull();
  });

  it("treats a blank form field as null and an edit as the owner's", () => {
    expect(formHourColumns({ hours_low: "", hours_high: "  ", hours_source: "price_book" })).toEqual({
      hours_low: null,
      hours_high: null,
      hours_source: null,
    });
    expect(formHourColumns({ hours_low: "0", hours_high: "2", hours_source: "owner" })).toEqual({
      hours_low: 0,
      hours_high: 2,
      hours_source: "owner",
    });
    expect(hoursAreMissing("", "8")).toBe(true);
    const edited = withHourEdit(
      { hours_low: "2", hours_high: "2", hours_source: "price_book" as string | null },
      "hours_high",
      "3",
    );
    expect(edited).toEqual({ hours_low: "2", hours_high: "3", hours_source: "owner" });
  });

  it("turns 60 billable minutes into 1 to 1 h from the travel calculation", () => {
    expect(travelTimeHours(60)).toEqual({ hours_low: 1, hours_high: 1, hours_source: "travel_calc" });
    expect(travelTimeHours(0)).toBeNull();
  });

  it("holds the quick wizard's send until hours and direct costs are filled", () => {
    expect(quickEstimateCanSend({
      hoursLow: "",
      hoursHigh: "",
      directCostsConfirmed: false,
      priceCents: 5000,
    })).toEqual({ ok: false, hoursMissing: true });
    expect(quickEstimateCanSend({
      hoursLow: "2",
      hoursHigh: "3",
      directCostsConfirmed: true,
      priceCents: 5000,
    }).ok).toBe(true);
  });
});
