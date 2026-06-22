import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { run } from "../list-unpaid-invoices.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

describe("list_unpaid_invoices", () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-22T12:00:00Z"));
  });
  afterAll(() => vi.useRealTimers());

  it("sums outstanding balances and computes days overdue", async () => {
    const { exec, calls } = makeExec([
      {
        match: /FROM invoices/,
        rows: [
          { id: "i1", invoice_number: "INV-1", status: "overdue", total_cents: 100000, paid_cents: 0, due_date: "2026-06-12", sent_at: null, client_name: "A" },
          { id: "i2", invoice_number: "INV-2", status: "partial", total_cents: 100000, paid_cents: 40000, due_date: null, sent_at: null, client_name: "B" },
        ],
      },
    ]);

    const result = (await run(exec, TEST_SESSION, {})) as {
      count: number;
      total_outstanding: { cents: number };
      invoices: Array<{ days_overdue: number | null; balance: { cents: number } }>;
    };

    expect(result.count).toBe(2);
    expect(result.total_outstanding.cents).toBe(160000);
    expect(result.invoices[0].days_overdue).toBe(10);
    expect(result.invoices[1].days_overdue).toBeNull();
    expect(result.invoices[1].balance.cents).toBe(60000);
    expect(calls[0].params).toEqual([TEST_SESSION.accountId, null, 50]);
  });

  it("passes a client filter through", async () => {
    const { exec, calls } = makeExec([{ match: /FROM invoices/, rows: [] }]);
    await run(exec, TEST_SESSION, { client_id: "22222222-2222-2222-2222-222222222222" });
    expect(calls[0].params?.[1]).toBe("22222222-2222-2222-2222-222222222222");
  });
});
