import { describe, it, expect } from "vitest";
import { spendToCents, toDateStr, cleanPhone } from "../csv-parse";

describe("spendToCents", () => {
  it("parses Square money strings to integer cents", () => {
    expect(spendToCents("$1,310.00")).toBe(131000);
    expect(spendToCents("836.98")).toBe(83698);
    expect(spendToCents("$10,306.95")).toBe(1030695);
  });
  it("treats blank / zero / junk as 0", () => {
    expect(spendToCents("")).toBe(0);
    expect(spendToCents("0")).toBe(0);
    expect(spendToCents("N/A")).toBe(0);
  });
});

describe("toDateStr", () => {
  it("keeps ISO dates, drops everything else", () => {
    expect(toDateStr("2024-12-13")).toBe("2024-12-13");
    expect(toDateStr("  2025-06-09 ")).toBe("2025-06-09");
    expect(toDateStr("")).toBe("");
    expect(toDateStr("12/13/2024")).toBe("");
  });
});

describe("cleanPhone", () => {
  it("strips Square's leading apostrophe", () => {
    expect(cleanPhone("'+16176972828")).toBe("+16176972828");
    expect(cleanPhone("+16034408481")).toBe("+16034408481");
    expect(cleanPhone("")).toBe("");
  });
});
