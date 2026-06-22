import { describe, it, expect } from "vitest";
import { run } from "../get-client-summary.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

const CLIENT_ID = "11111111-1111-1111-1111-111111111111";

function handlers() {
  return [
    { match: /FROM clients WHERE id/, rows: [{ id: CLIENT_ID, name: "Jane", email: null, phone: null, notes: null, created_at: "2026-01-01" }] },
    { match: /FROM properties/, rows: [{ c: 2 }] },
    { match: /FROM jobs/, rows: [{ status: "completed", c: 3 }, { status: "in_progress", c: 1 }] },
    // Order matters: the payments query embeds a "FROM invoices" subquery, so
    // match these on their distinctive aggregate aliases, not the table name.
    { match: /SUM\(amount_cents\)/, rows: [{ total: 500000, last: "2026-06-01" }] },
    { match: /SUM\(total_cents - paid_cents\)/, rows: [{ c: 2, balance: 180000 }] },
    { match: /FROM estimates/, rows: [{ c: 1, t: 250000 }] },
  ];
}

describe("get_client_summary", () => {
  it("aggregates the client 360 with formatted money", async () => {
    const { exec } = makeExec(handlers());
    const result = (await run(exec, TEST_SESSION, { client_id: CLIENT_ID })) as {
      jobs: { total: number; by_status: Record<string, number> };
      open_estimates: { total: { formatted: string } };
      unpaid_invoices: { outstanding: { cents: number } };
      payments: { lifetime: { formatted: string } };
    };

    expect(result.jobs.total).toBe(4);
    expect(result.jobs.by_status.completed).toBe(3);
    expect(result.open_estimates.total.formatted).toBe("$2,500.00");
    expect(result.unpaid_invoices.outstanding.cents).toBe(180000);
    expect(result.payments.lifetime.formatted).toBe("$5,000.00");
  });

  it("throws when the client is not in the account", async () => {
    const { exec } = makeExec([{ match: /FROM clients WHERE id/, rows: [] }]);
    await expect(run(exec, TEST_SESSION, { client_id: CLIENT_ID })).rejects.toThrow(/No client/);
  });

  it("rejects a non-uuid client_id", async () => {
    const { exec } = makeExec(handlers());
    await expect(run(exec, TEST_SESSION, { client_id: "nope" })).rejects.toThrow();
  });
});
