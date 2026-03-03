import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatExpenseDate,
  formatMonthLabel,
  currentMonthKey,
  categoryLabel,
  isValidMonthKey,
  recentMonthOptions,
} from "../ui";

describe("formatExpenseDate", () => {
  it("formats a YYYY-MM-DD date to a readable label", () => {
    // Use a fixed date that is unambiguous across timezones
    expect(formatExpenseDate("2026-03-15")).toBe("Mar 15, 2026");
    expect(formatExpenseDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatExpenseDate("2025-12-31")).toBe("Dec 31, 2025");
  });

  it("does not shift the date due to UTC", () => {
    // If the date were parsed as UTC midnight, some timezones would show the previous day.
    // Our implementation uses (year, month-1, day) local constructor — assert it stays correct.
    const result = formatExpenseDate("2026-03-01");
    expect(result).toBe("Mar 1, 2026");
  });
});

describe("formatMonthLabel", () => {
  it("formats a YYYY-MM key to a human-readable month label", () => {
    expect(formatMonthLabel("2026-03")).toBe("March 2026");
    expect(formatMonthLabel("2026-01")).toBe("January 2026");
    expect(formatMonthLabel("2025-12")).toBe("December 2025");
  });
});

describe("isValidMonthKey", () => {
  it("accepts valid calendar month keys", () => {
    expect(isValidMonthKey("2026-03")).toBe(true);
    expect(isValidMonthKey("2026-12")).toBe(true);
  });

  it("rejects malformed or impossible month keys", () => {
    expect(isValidMonthKey("2026-3")).toBe(false);
    expect(isValidMonthKey("2026-00")).toBe(false);
    expect(isValidMonthKey("2026-13")).toBe(false);
    expect(isValidMonthKey("not-a-month")).toBe(false);
  });
});

describe("currentMonthKey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns YYYY-MM for the current month", () => {
    expect(currentMonthKey()).toBe("2026-03");
  });
});

describe("categoryLabel", () => {
  it("returns the human-readable label for a valid category", () => {
    expect(categoryLabel("materials")).toBe("Materials");
    expect(categoryLabel("fuel")).toBe("Fuel");
    expect(categoryLabel("subcontractors")).toBe("Subcontractors");
    expect(categoryLabel("meals")).toBe("Meals & Entertainment");
    expect(categoryLabel("other")).toBe("Other");
  });
});

describe("recentMonthOptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-15T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 12 month options", () => {
    const options = recentMonthOptions();
    expect(options).toHaveLength(12);
  });

  it("starts with the current month", () => {
    const options = recentMonthOptions();
    expect(options[0].value).toBe("2026-03");
    expect(options[0].label).toBe("March 2026");
  });

  it("ends with 11 months ago", () => {
    const options = recentMonthOptions();
    expect(options[11].value).toBe("2025-04");
    expect(options[11].label).toBe("April 2025");
  });

  it("all values are in YYYY-MM format", () => {
    const options = recentMonthOptions();
    for (const opt of options) {
      expect(opt.value).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("all labels are non-empty strings", () => {
    const options = recentMonthOptions();
    for (const opt of options) {
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});
