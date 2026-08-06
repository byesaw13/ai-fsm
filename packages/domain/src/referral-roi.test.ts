import { describe, expect, it } from "vitest";
import {
  buildReferralRoiRow,
  normalizeReferralSource,
  referralSourceLabel,
  sortReferralRoiRows,
} from "./referral-roi";

describe("normalizeReferralSource", () => {
  it("maps known sources and blanks to unknown", () => {
    expect(normalizeReferralSource("realtor")).toBe("realtor");
    expect(normalizeReferralSource(null)).toBe("unknown");
    expect(normalizeReferralSource("  ")).toBe("unknown");
    expect(normalizeReferralSource("tv_ad")).toBe("unknown");
  });
});

describe("buildReferralRoiRow", () => {
  it("computes conversion and paid-per-job", () => {
    const row = buildReferralRoiRow({
      source: "online",
      request_count: 10,
      job_count: 4,
      revenue_cents: 100_000,
      paid_cents: 80_000,
    });
    expect(row.label).toBe("Online");
    expect(row.conversion_rate).toBeCloseTo(0.4);
    expect(row.paid_per_job_cents).toBe(20_000);
  });

  it("returns null ratios when denominators are zero", () => {
    const row = buildReferralRoiRow({
      source: null,
      request_count: 0,
      job_count: 0,
      revenue_cents: 0,
      paid_cents: 0,
    });
    expect(row.source).toBe("unknown");
    expect(row.conversion_rate).toBeNull();
    expect(row.paid_per_job_cents).toBeNull();
  });
});

describe("sortReferralRoiRows", () => {
  it("orders by paid_cents desc", () => {
    const rows = sortReferralRoiRows([
      buildReferralRoiRow({ source: "online", request_count: 1, job_count: 1, revenue_cents: 100, paid_cents: 50 }),
      buildReferralRoiRow({ source: "realtor", request_count: 2, job_count: 2, revenue_cents: 200, paid_cents: 200 }),
    ]);
    expect(rows[0].source).toBe("realtor");
    expect(rows[1].source).toBe("online");
  });
});

describe("referralSourceLabel", () => {
  it("labels friend_neighbor", () => {
    expect(referralSourceLabel("friend_neighbor")).toBe("Friend / neighbor");
  });
});
