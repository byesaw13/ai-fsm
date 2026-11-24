import { describe, expect, it } from "vitest";
import { storeFamilyOf } from "@ai-fsm/domain";
import { observationFingerprints, variantCacheFrom, type CacheObservation } from "../ledger";

const obs = (over: Partial<CacheObservation>): CacheObservation => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  kind: "receipt",
  observedOn: "2026-06-01",
  unitPriceCents: 1000,
  isSale: false,
  status: "active",
  createdAt: "2026-06-01T00:00:00Z",
  ...over,
});

describe("variantCacheFrom", () => {
  it("recomputes average and count without catalog_summary rows", () => {
    const cache = variantCacheFrom([
      obs({ kind: "catalog_summary", unitPriceCents: 999, observedOn: "2026-01-01" }),
      obs({ unitPriceCents: 1000, observedOn: "2026-02-01" }),
      obs({ unitPriceCents: 1200, observedOn: "2026-03-01" }),
    ]);
    expect(cache.avgPaidCents).toBe(1100);
    expect(cache.purchaseCount).toBe(2);
    expect(cache.unitCostCents).toBe(1200);
    expect(cache.lastPurchasedAt).toBe("2026-03-01");
  });

  it("a summary dated after the newest real observation stays the latest price but is not counted", () => {
    const cache = variantCacheFrom([
      obs({ unitPriceCents: 1000, observedOn: "2026-02-01" }),
      obs({ id: "s", kind: "catalog_summary", unitPriceCents: 1400, observedOn: "2026-05-01" }),
    ]);
    expect(cache.unitCostCents).toBe(1400);
    expect(cache.lastPurchasedAt).toBe("2026-05-01");
    expect(cache.purchaseCount).toBe(1);
    expect(cache.avgPaidCents).toBe(1000);
    expect(cache.supersededSummaryIds).toEqual([]);
  });

  it("a real observation on or after the summary's date supersedes it; an older one does not", () => {
    const summary = obs({ id: "s", kind: "catalog_summary", unitPriceCents: 1400, observedOn: "2026-05-01" });
    expect(variantCacheFrom([summary, obs({ observedOn: "2026-04-30" })]).supersededSummaryIds).toEqual([]);
    const later = variantCacheFrom([summary, obs({ kind: "supplier_csv", unitPriceCents: 1300, observedOn: "2026-05-01" })]);
    expect(later.supersededSummaryIds).toEqual(["s"]);
    expect(later.unitCostCents).toBe(1300);
  });

  it("a sale observation is not counted in the regular average and does not replace the regular price", () => {
    const cache = variantCacheFrom([
      obs({ unitPriceCents: 1000, observedOn: "2026-02-01" }),
      obs({ unitPriceCents: 600, observedOn: "2026-03-01", isSale: true }),
    ]);
    expect(cache.avgPaidCents).toBe(1000);
    expect(cache.purchaseCount).toBe(1);
    expect(cache.unitCostCents).toBe(1000);
    expect(cache.lastPurchasedAt).toBe("2026-03-01");
  });

  it("only sale evidence still gives a price", () => {
    expect(variantCacheFrom([obs({ unitPriceCents: 600, isSale: true })]).unitCostCents).toBe(600);
  });

  it("a manual check sets the price but is not a purchase", () => {
    const cache = variantCacheFrom([
      obs({ unitPriceCents: 1000, observedOn: "2026-02-01" }),
      obs({ kind: "manual_check", unitPriceCents: 1150, observedOn: "2026-04-01" }),
    ]);
    expect(cache.unitCostCents).toBe(1150);
    expect(cache.purchaseCount).toBe(1);
    expect(cache.lastPurchasedAt).toBe("2026-02-01");
  });

  it("voided, pending, dismissed and AI-allowance rows are ignored when real evidence exists", () => {
    const cache = variantCacheFrom([
      obs({ unitPriceCents: 1000 }),
      obs({ unitPriceCents: 5000, status: "pending", observedOn: "2026-09-01" }),
      obs({ unitPriceCents: 5000, status: "dismissed", observedOn: "2026-09-01" }),
      obs({ unitPriceCents: 5000, kind: "ai_allowance", observedOn: "2026-09-01" }),
    ]);
    expect(cache.unitCostCents).toBe(1000);
    expect(cache.purchaseCount).toBe(1);
  });

  it("no evidence left clears the purchase metrics", () => {
    const cache = variantCacheFrom([obs({ unitPriceCents: 900, status: "superseded" })]);
    expect(cache).toMatchObject({ unitCostCents: null, avgPaidCents: null, purchaseCount: 0, lastPurchasedAt: null });
  });

  it("with only an AI allowance, the allowance is the price shown and nothing is a purchase", () => {
    const cache = variantCacheFrom([obs({ kind: "ai_allowance", unitPriceCents: 1299 })]);
    expect(cache).toMatchObject({ unitCostCents: 1299, purchaseCount: 0, lastPurchasedAt: null });
  });
});

describe("observationFingerprints", () => {
  it("two identical lines in one transaction both count", () => {
    const keys = observationFingerprints([
      { sku: "123", name: "Screws", unitPriceCents: 500, quantity: 1 },
      { sku: "123", name: "Screws", unitPriceCents: 500, quantity: 1 },
      { sku: null, name: "Tape", unitPriceCents: 300, quantity: 2 },
    ]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("the same lines in another order give the same keys", () => {
    const a = observationFingerprints([
      { sku: "1", name: "A", unitPriceCents: 1, quantity: 1 },
      { sku: "2", name: "B", unitPriceCents: 2, quantity: 1 },
    ]);
    const b = observationFingerprints([
      { sku: "2", name: "B", unitPriceCents: 2, quantity: 1 },
      { sku: "1", name: "A", unitPriceCents: 1, quantity: 1 },
    ]);
    expect(new Set(a)).toEqual(new Set(b));
  });
});

describe("storeFamilyOf", () => {
  it("normalizes supplier names", () => {
    expect(storeFamilyOf("The Home Depot")).toBe("home_depot");
    expect(storeFamilyOf("Home Depot")).toBe("home_depot");
    expect(storeFamilyOf("Lowe's")).toBe("lowes");
    expect(storeFamilyOf("Cyr Lumber WINDHAM")).toBe("other");
    expect(storeFamilyOf(null)).toBe("other");
  });
});
