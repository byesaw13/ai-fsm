import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PoolClient } from "pg";

const findOrCreateVariant = vi.fn();
const recordObservations = vi.fn(async () => ({ inserted: 1, duplicates: 0 }));
const replaceSourceObservations = vi.fn(async () => ({ inserted: 1, duplicates: 0, superseded: 0 }));

vi.mock("../ledger", async (orig) => ({
  ...(await orig<typeof import("../ledger")>()),
  findOrCreateVariant: (...a: unknown[]) => findOrCreateVariant(...a),
  recordObservations: (...a: unknown[]) => recordObservations(...(a as [])),
  replaceSourceObservations: (...a: unknown[]) => replaceSourceObservations(...(a as [])),
}));

import { learnMaterialsFromLineItems } from "../catalog";

const client = {} as PoolClient;

beforeEach(() => {
  vi.clearAllMocks();
  findOrCreateVariant.mockImplementation(async (_c, _a, item: { sku?: string | null; name: string }) => ({
    id: `v-${item.sku ?? item.name}`,
    storeFamily: "home_depot",
    created: false,
  }));
});

describe("learnMaterialsFromLineItems (TASK-210)", () => {
  it("a receipt replaces its own observations, keyed to the receipt", async () => {
    const { learned } = await learnMaterialsFromLineItems(
      client,
      { accountId: "a1", supplier: "The Home Depot", purchasedAt: "2026-07-01", source: { kind: "receipt", expenseId: "e1" } },
      [
        { name: "Screws", unit_cost_cents: 500, sku: "123", quantity: 1 },
        { name: "Screws", unit_cost_cents: 500, sku: "123", quantity: 1 },
        { name: "", unit_cost_cents: 100 },
        { name: "Free", unit_cost_cents: 0 },
      ],
    );
    expect(learned).toBe(2);
    const [, , sourceRef, rows] = replaceSourceObservations.mock.calls[0] as unknown as [
      unknown, string, string, { kind: string; dedupeKey: string; observedOn: string }[],
    ];
    expect(sourceRef).toBe("expense:e1");
    expect(rows.map((r) => r.kind)).toEqual(["receipt", "receipt"]);
    expect(rows[0].dedupeKey).toMatch(/^receipt:e1:/);
    expect(rows[0].dedupeKey).not.toBe(rows[1].dedupeKey);
    expect(rows[0].observedOn).toBe("2026-07-01");
    expect(recordObservations).not.toHaveBeenCalled();
  });

  it("a receipt with no priced lines clears its observations", async () => {
    await learnMaterialsFromLineItems(client, { accountId: "a1", source: { kind: "receipt", expenseId: "e2" } }, []);
    expect(replaceSourceObservations).toHaveBeenCalledWith(client, "a1", "expense:e2", []);
  });

  it("a CSV row is a supplier_csv observation, sale kept as sale, explicit key honored", async () => {
    await learnMaterialsFromLineItems(
      client,
      { accountId: "a1", supplier: "Lowe's", purchasedAt: "2026-05-02", source: { kind: "supplier_csv", ref: "imp" } },
      [{ name: "Tape", unit_cost_cents: 300, is_sale: true, dedupe_key: "csv:k1" }],
    );
    const [, , rows] = recordObservations.mock.calls[0] as unknown as [unknown, string, { kind: string; isSale: boolean; dedupeKey: string }[]];
    expect(rows[0]).toMatchObject({ kind: "supplier_csv", isSale: true, dedupeKey: "csv:k1" });
  });
});
