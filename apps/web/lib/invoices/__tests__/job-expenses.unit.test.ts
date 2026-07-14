import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import {
  materialHandlingCents,
  materialInvoiceTotalCents,
  materialExpenseDescription,
  fetchJobMaterialExpenses,
} from "../job-expenses";

describe("job-expenses", () => {
  it("bills materials at cost plus 15% handling (estimate contract)", () => {
    expect(materialHandlingCents(2872)).toBe(431);
    expect(materialInvoiceTotalCents(2872)).toBe(3303);
    expect(materialHandlingCents(35372)).toBe(5306);
  });

  it("prefers expense notes for invoice line description", () => {
    expect(
      materialExpenseDescription({
        id: "e1",
        vendor_name: "Home Depot",
        amount_cents: 1000,
        notes: "PVC trim and siding",
      }),
    ).toBe("PVC trim and siding");
  });
});

function makeClient(results: unknown[]): PoolClient {
  let index = 0;
  return {
    query: vi.fn().mockImplementation(() => Promise.resolve(results[index++] ?? { rows: [], rowCount: 0 })),
  } as unknown as PoolClient;
}

describe("fetchJobMaterialExpenses", () => {
  it("returns linked materials expenses with itemized lines and billed status", async () => {
    const client = makeClient([
      {
        rows: [
          {
            id: "exp-1",
            vendor_name: "Home Depot",
            amount_cents: 5000,
            notes: null,
            expense_date: "2026-07-10",
            billed: false,
          },
          {
            id: "exp-2",
            vendor_name: "Lowes",
            amount_cents: 3000,
            notes: "Trim",
            expense_date: "2026-07-08",
            billed: true,
          },
        ],
        rowCount: 2,
      },
      // fetchExpenseLineItems for exp-1
      {
        rows: [
          { id: "li-1", expense_id: "exp-1", name: "2x4", quantity: 10, unit_cost_cents: 400, sku: null, sort_order: 0 },
        ],
        rowCount: 1,
      },
      // fetchExpenseLineItems for exp-2
      { rows: [], rowCount: 0 },
    ]);

    const rows = await fetchJobMaterialExpenses(client, "acct-1", "job-1");

    expect(rows).toHaveLength(2);
    expect(rows[0].billed).toBe(false);
    expect(rows[0].line_items).toEqual([
      { id: "li-1", name: "2x4", quantity: 10, unit_cost_cents: 400, line_total_cents: 4000 },
    ]);
    expect(rows[1].billed).toBe(true);
    expect(rows[1].line_items).toEqual([]);

    const firstCallSql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(firstCallSql).toContain("e.job_id = $2");
    expect(firstCallSql).toContain("e.category = 'materials'");
  });
});