import { describe, it, expect } from "vitest";
import { formatCents, formatCentsShort, parseDollarsToCents } from "../index";

describe("formatCents", () => {
  it("formats, groups, and signs", () => {
    expect(formatCents(12345)).toBe("$123.45");
    expect(formatCents(-500)).toBe("-$5.00");
    expect(formatCents(123456789)).toBe("$1,234,567.89");
    expect(formatCents("250")).toBe("$2.50");
  });

  it("handles null and undefined as zero", () => {
    expect(formatCents(null)).toBe("$0.00");
    expect(formatCents(undefined)).toBe("$0.00");
  });
});

describe("parseDollarsToCents", () => {
  it("converts dollar string to cents", () => {
    expect(parseDollarsToCents("12.50")).toBe(1250);
    expect(parseDollarsToCents("100")).toBe(10000);
    expect(parseDollarsToCents("0.01")).toBe(1);
  });

  it("rounds to nearest cent", () => {
    expect(parseDollarsToCents("1.005")).toBe(100);
    expect(parseDollarsToCents("1.004")).toBe(100);
    expect(parseDollarsToCents("1.006")).toBe(101);
  });

  it("returns 0 for empty, non-numeric, or negative input", () => {
    expect(parseDollarsToCents("")).toBe(0);
    expect(parseDollarsToCents("abc")).toBe(0);
    expect(parseDollarsToCents("$10")).toBe(0);
    expect(parseDollarsToCents("-5")).toBe(0);
  });
});

describe("formatCentsShort", () => {
  it("matches legacy dollarsShort whole-dollar rounding", () => {
    expect(formatCentsShort(162500)).toMatchInlineSnapshot(`"$1,625"`);
    expect(formatCentsShort(50000)).toMatchInlineSnapshot(`"$500"`);
    expect(formatCentsShort(125050)).toMatchInlineSnapshot(`"$1,251"`);
  });
});