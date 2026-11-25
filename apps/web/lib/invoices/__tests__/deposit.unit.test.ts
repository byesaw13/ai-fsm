import { describe, expect, it } from "vitest";
import { defaultDepositCents, gatedDepositCents } from "../deposit";
import { percentOfCents } from "@/lib/estimates/deposit-policy";

describe("percentOfCents", () => {
  it("is the one percent-of-a-total rule, clamped to 0–100%", () => {
    expect(percentOfCents(100_00, 30)).toBe(30_00);
    expect(percentOfCents(100_00, 33.5)).toBe(33_50);
    expect(percentOfCents(100_00, 150)).toBe(100_00);
    expect(percentOfCents(100_00, -5)).toBe(0);
  });
});

describe("defaultDepositCents", () => {
  it("uses the estimate's configured deposit when the owner set one", () => {
    expect(
      defaultDepositCents({ estimateTotalCents: 1000_00, configuredDepositCents: 250_00, depositPercent: 30 }),
    ).toBe(250_00);
  });

  it("falls back to the company standard % of the total when none configured", () => {
    expect(
      defaultDepositCents({ estimateTotalCents: 1000_00, configuredDepositCents: 0, depositPercent: 30 }),
    ).toBe(300_00);
    expect(
      defaultDepositCents({ estimateTotalCents: 1000_00, configuredDepositCents: null, depositPercent: 30 }),
    ).toBe(300_00);
  });

  it("clamps to the total and never goes negative", () => {
    expect(
      defaultDepositCents({ estimateTotalCents: 100_00, configuredDepositCents: 500_00, depositPercent: 30 }),
    ).toBe(100_00);
    expect(
      defaultDepositCents({ estimateTotalCents: 0, configuredDepositCents: 0, depositPercent: 30 }),
    ).toBe(0);
  });
});

describe("gatedDepositCents", () => {
  it("is the configured/company deposit when nothing has been billed yet", () => {
    expect(
      gatedDepositCents({
        estimateTotalCents: 1000_00,
        configuredDepositCents: 0,
        depositPercent: 30,
        alreadyInvoicedCents: 0,
      }),
    ).toBe(300_00);
  });

  it("clamps to remaining balance after progress invoices", () => {
    expect(
      gatedDepositCents({
        estimateTotalCents: 1000_00,
        configuredDepositCents: 0,
        depositPercent: 30,
        alreadyInvoicedCents: 800_00,
      }),
    ).toBe(200_00);
  });

  it("is 0 when progress already covers the total", () => {
    expect(
      gatedDepositCents({
        estimateTotalCents: 1000_00,
        configuredDepositCents: 300_00,
        depositPercent: 30,
        alreadyInvoicedCents: 1000_00,
      }),
    ).toBe(0);
  });
});
