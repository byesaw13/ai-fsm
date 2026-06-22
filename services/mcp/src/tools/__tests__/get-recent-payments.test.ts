import { describe, it, expect } from "vitest";
import { run } from "../get-recent-payments.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

describe("get_recent_payments", () => {
  it("lists completed payments and totals them", async () => {
    const { exec, calls } = makeExec([
      {
        match: /FROM payments p/,
        rows: [
          { id: "p1", amount_cents: 100000, method: "check", payment_type: "deposit", received_at: "2026-06-20", paid_at: "2026-06-20", invoice_number: "INV-1", client_name: "A" },
          { id: "p2", amount_cents: 50000, method: "venmo", payment_type: "final", received_at: "2026-06-19", paid_at: "2026-06-19", invoice_number: "INV-2", client_name: "B" },
        ],
      },
    ]);

    const result = (await run(exec, TEST_SESSION, { limit: 10 })) as {
      count: number;
      total_received: { cents: number };
    };

    expect(result.count).toBe(2);
    expect(result.total_received.cents).toBe(150000);
    expect(calls[0].params).toEqual([TEST_SESSION.accountId, null, 10]);
    // only completed payments are queried
    expect(calls[0].text).toMatch(/p\.status = 'paid'/);
  });

  it("passes a since date through and rejects bad date formats", async () => {
    const { exec, calls } = makeExec([{ match: /FROM payments p/, rows: [] }]);
    await run(exec, TEST_SESSION, { since: "2026-06-01" });
    expect(calls[0].params?.[1]).toBe("2026-06-01");
    await expect(run(exec, TEST_SESSION, { since: "June 1" })).rejects.toThrow();
  });
});
