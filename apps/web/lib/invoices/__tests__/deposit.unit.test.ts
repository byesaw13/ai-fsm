import { describe, expect, it } from "vitest";
import { requestedDepositCents, defaultDepositCents, gatedDepositCents } from "../deposit";

describe("requestedDepositCents", () => {
  it("computes a percentage of the full total (incl. tax)", () => {
    expect(requestedDepositCents({ depositType: "percentage", depositPercentage: 30 }, 100_00)).toBe(30_00);
    expect(requestedDepositCents({ depositType: "percentage", depositPercentage: 33.5 }, 100_00)).toBe(33_50);
  });

  it("recomputes from the current total (change-order safe)", () => {
    const policy = { depositType: "percentage" as const, depositPercentage: 25 };
    expect(requestedDepositCents(policy, 100_00)).toBe(25_00);
    expect(requestedDepositCents(policy, 200_00)).toBe(50_00); // total went up → deposit follows
  });

  it("uses the fixed amount, clamped to the total", () => {
    expect(requestedDepositCents({ depositType: "fixed", depositFixedCents: 40_00 }, 100_00)).toBe(40_00);
    expect(requestedDepositCents({ depositType: "fixed", depositFixedCents: 500_00 }, 100_00)).toBe(100_00);
  });

  it("returns 0 for type none, or when the total is 0", () => {
    expect(requestedDepositCents({ depositType: "none" }, 100_00)).toBe(0);
    expect(requestedDepositCents({ depositType: "percentage", depositPercentage: 30 }, 0)).toBe(0);
  });

  it("clamps a percentage to 0..100 and never exceeds the total", () => {
    expect(requestedDepositCents({ depositType: "percentage", depositPercentage: 150 }, 100_00)).toBe(100_00);
    expect(requestedDepositCents({ depositType: "percentage", depositPercentage: -5 }, 100_00)).toBe(0);
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
