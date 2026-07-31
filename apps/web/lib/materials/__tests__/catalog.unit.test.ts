import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  computeRunningAverage,
  learnMaterialsFromLineItems,
  upsertMaterialFromPurchase,
} from "../catalog";

describe("computeRunningAverage", () => {
  it("first purchase sets avg to cost and count 1", () => {
    expect(computeRunningAverage(null, 0, 500)).toEqual({
      avg_paid_cents: 500,
      purchase_count: 1,
    });
  });

  it("second purchase averages last and new", () => {
    expect(computeRunningAverage(400, 1, 600)).toEqual({
      avg_paid_cents: 500,
      purchase_count: 2,
    });
  });

  it("rounds fractional averages", () => {
    // (100*2 + 101) / 3 = 100.333… → 100
    expect(computeRunningAverage(100, 2, 101)).toEqual({
      avg_paid_cents: 100,
      purchase_count: 3,
    });
  });
});

function makeClient(handlers: Array<(sql: string, params: unknown[]) => { rows: unknown[] }>): PoolClient {
  let i = 0;
  return {
    query: vi.fn().mockImplementation((sql: string, params: unknown[] = []) => {
      const handler = handlers[i++];
      if (!handler) return Promise.resolve({ rows: [], rowCount: 0 });
      return Promise.resolve(handler(sql, params));
    }),
  } as unknown as PoolClient;
}

describe("upsertMaterialFromPurchase", () => {
  it("matches by SKU before name and updates avg", async () => {
    const client = makeClient([
      // by SKU hit
      () => ({
        rows: [
          {
            id: "m1",
            account_id: "a1",
            name: "Old Name",
            brand: null,
            category: "hardware",
            unit: "each",
            unit_cost_cents: 400,
            supplier: "Home Depot",
            sku: "1006765300",
            last_purchased_at: "2026-01-01",
            notes: null,
            is_active: true,
            avg_paid_cents: 400,
            purchase_count: 1,
          },
        ],
      }),
      // UPDATE
      (_sql, params) => ({
        rows: [
          {
            id: "m1",
            account_id: "a1",
            name: "DW Access Door",
            brand: null,
            category: "hardware",
            unit: "each",
            unit_cost_cents: params[1],
            supplier: "Home Depot",
            sku: "1006765300",
            last_purchased_at: "2026-07-01",
            notes: null,
            is_active: true,
            avg_paid_cents: params[2],
            purchase_count: params[3],
          },
        ],
      }),
    ]);

    const row = await upsertMaterialFromPurchase(
      client,
      { accountId: "a1", supplier: "Home Depot", purchasedAt: "2026-07-01" },
      { name: "DW Access Door", unit_cost_cents: 600, sku: "1006765300" },
    );

    expect(row?.unit_cost_cents).toBe(600);
    expect(row?.avg_paid_cents).toBe(500);
    expect(row?.purchase_count).toBe(2);
    expect((client.query as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain("lower(btrim(sku))");
  });

  it("falls back to name+unit when no SKU", async () => {
    const client = makeClient([
      // no SKU path — name lookup only (sku null skips SKU query)
      () => ({ rows: [] }),
      // INSERT
      () => ({
        rows: [
          {
            id: "m2",
            account_id: "a1",
            name: "2x4",
            brand: null,
            category: "lumber",
            unit: "each",
            unit_cost_cents: 399,
            supplier: null,
            sku: null,
            last_purchased_at: null,
            notes: null,
            is_active: true,
            avg_paid_cents: 399,
            purchase_count: 1,
          },
        ],
      }),
    ]);

    const row = await upsertMaterialFromPurchase(
      client,
      { accountId: "a1", category: "lumber" },
      { name: "2x4", unit_cost_cents: 399 },
    );

    expect(row?.name).toBe("2x4");
    expect(row?.purchase_count).toBe(1);
    // First query is name match (no SKU)
    const firstSql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(firstSql).toContain("lower(btrim(name))");
  });

  it("skips zero cost and blank name", async () => {
    const client = makeClient([]);
    expect(
      await upsertMaterialFromPurchase(client, { accountId: "a1" }, { name: "", unit_cost_cents: 100 }),
    ).toBeNull();
    expect(
      await upsertMaterialFromPurchase(client, { accountId: "a1" }, { name: "x", unit_cost_cents: 0 }),
    ).toBeNull();
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe("learnMaterialsFromLineItems", () => {
  it("counts learned lines", async () => {
    const client = makeClient([
      () => ({ rows: [] }),
      () => ({
        rows: [
          {
            id: "m1",
            account_id: "a1",
            name: "Nail",
            brand: null,
            category: "other",
            unit: "each",
            unit_cost_cents: 100,
            supplier: null,
            sku: null,
            last_purchased_at: null,
            notes: null,
            is_active: true,
            avg_paid_cents: 100,
            purchase_count: 1,
          },
        ],
      }),
      // second line skipped (zero cost) — no queries
    ]);

    const result = await learnMaterialsFromLineItems(
      client,
      { accountId: "a1" },
      [
        { name: "Nail", unit_cost_cents: 100 },
        { name: "Bad", unit_cost_cents: 0 },
      ],
    );
    expect(result.learned).toBe(1);
  });
});
