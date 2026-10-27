import { describe, expect, it } from "vitest";
import { lineHourColumns, storedHour, storedHourRange, storedHourSource } from "../stored-hours";

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
