import { describe, it, expect } from "vitest";
import { run } from "../get-invoice-status.js";
import { makeExec, TEST_SESSION } from "./helpers.js";

const ROW = {
  id: "inv1",
  invoice_number: "INV-0042",
  status: "partial",
  total_cents: 300000,
  paid_cents: 100000,
  due_date: "2026-07-01",
  sent_at: "2026-06-01",
  paid_at: null,
  client_name: "Jane",
};

describe("get_invoice_status", () => {
  it("looks up by invoice number and computes the balance", async () => {
    const { exec, calls } = makeExec([{ match: /FROM invoices/, rows: [ROW] }]);
    const result = (await run(exec, TEST_SESSION, { invoice_number: "INV-0042" })) as {
      balance: { cents: number; formatted: string };
      is_paid: boolean;
    };
    expect(result.balance.cents).toBe(200000);
    expect(result.balance.formatted).toBe("$2,000.00");
    expect(result.is_paid).toBe(false);
    expect(calls[0].text).toMatch(/i\.invoice_number = \$2/);
    expect(calls[0].params).toEqual([TEST_SESSION.accountId, "INV-0042"]);
  });

  it("looks up by id when provided", async () => {
    const { exec, calls } = makeExec([{ match: /FROM invoices/, rows: [ROW] }]);
    await run(exec, TEST_SESSION, { invoice_id: "00000000-0000-0000-0000-0000000000ff" });
    expect(calls[0].text).toMatch(/i\.id = \$2/);
  });

  it("requires at least one identifier", async () => {
    const { exec } = makeExec([{ match: /FROM invoices/, rows: [] }]);
    await expect(run(exec, TEST_SESSION, {})).rejects.toThrow();
  });

  it("throws when not found", async () => {
    const { exec } = makeExec([{ match: /FROM invoices/, rows: [] }]);
    await expect(run(exec, TEST_SESSION, { invoice_number: "INV-9999" })).rejects.toThrow(/No invoice/);
  });
});
