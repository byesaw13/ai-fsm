import { describe, expect, it } from "vitest";
import {
  STANDARD_DEPOSIT_PERCENT,
  STANDARD_DEPOSIT_TERMS,
  formatDepositPercent,
  renderDepositTerms,
  resolveDepositPolicy,
} from "./dovetails";

describe("formatDepositPercent", () => {
  it("drops a trailing .00 but keeps real decimals", () => {
    expect(formatDepositPercent(30)).toBe("30%");
    expect(formatDepositPercent(33.5)).toBe("33.5%");
    expect(formatDepositPercent(12.25)).toBe("12.25%");
  });
});

describe("renderDepositTerms", () => {
  it("substitutes every {deposit_percent} token", () => {
    expect(renderDepositTerms("A {deposit_percent} deposit; {deposit_percent} total.", 40)).toBe(
      "A 40% deposit; 40% total.",
    );
  });

  it("leaves wording without the token untouched", () => {
    expect(renderDepositTerms("No percentage mentioned.", 30)).toBe("No percentage mentioned.");
  });
});

describe("resolveDepositPolicy", () => {
  it("uses the configured percentage and substitutes it into the wording", () => {
    const { percent, terms } = resolveDepositPolicy({
      deposit_percent: 50,
      deposit_terms: "A deposit of {deposit_percent} is required.",
    });
    expect(percent).toBe(50);
    expect(terms).toBe("A deposit of 50% is required.");
  });

  it("falls back to the standard percentage and default wording when unset", () => {
    const { percent, terms } = resolveDepositPolicy(undefined);
    expect(percent).toBe(STANDARD_DEPOSIT_PERCENT);
    // Default wording carries the token, so the standard % must appear rendered.
    expect(STANDARD_DEPOSIT_TERMS).toContain("{deposit_percent}");
    expect(terms).toContain(`${STANDARD_DEPOSIT_PERCENT}%`);
    expect(terms).not.toContain("{deposit_percent}");
  });

  it("ignores out-of-range or non-numeric percentages", () => {
    expect(resolveDepositPolicy({ deposit_percent: -5 }).percent).toBe(STANDARD_DEPOSIT_PERCENT);
    expect(resolveDepositPolicy({ deposit_percent: 150 }).percent).toBe(STANDARD_DEPOSIT_PERCENT);
    expect(
      resolveDepositPolicy({ deposit_percent: Number.NaN }).percent,
    ).toBe(STANDARD_DEPOSIT_PERCENT);
  });

  it("treats 0% as 'no deposit' — emits no default copy to render", () => {
    const { percent, terms } = resolveDepositPolicy({ deposit_percent: 0 });
    expect(percent).toBe(0);
    // Documents only render non-empty terms, so this shows no Deposits section
    // rather than "a deposit of 0% is required".
    expect(terms).toBe("");
  });

  it("renders no section when wording is explicitly cleared (deposit line lives in the terms doc)", () => {
    const { percent, terms } = resolveDepositPolicy({ deposit_percent: 30, deposit_terms: "" });
    expect(percent).toBe(30);
    expect(terms).toBe("");
  });

  it("still honors explicit custom wording at 0%", () => {
    const { terms } = resolveDepositPolicy({
      deposit_percent: 0,
      deposit_terms: "We do not require deposits.",
    });
    expect(terms).toBe("We do not require deposits.");
  });
});
