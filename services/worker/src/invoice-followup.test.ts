import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Client } from "pg";
import {
  findDueFollowups,
  findOverdueInvoices,
  getCadenceSteps,
  emitInvoiceFollowup,
  markAutomationRun,
  processInvoiceFollowup,
  runInvoiceFollowups,
} from "./invoice-followup.js";
import type { AutomationRow, OverdueInvoice } from "./invoice-followup.js";

// Mock pg Client
function mockClient(overrides: Record<string, unknown> = {}): Client {
  return {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    ...overrides,
  } as unknown as Client;
}

const AUTOMATION: AutomationRow = {
  id: "auto-f1",
  account_id: "acct-1",
  type: "invoice_followup",
  config: { days_overdue: [7, 14, 30] },
  enabled: true,
  next_run_at: "2026-02-17T00:00:00Z",
};

const INVOICE: OverdueInvoice = {
  id: "inv-1",
  account_id: "acct-1",
  client_id: "client-1",
  invoice_number: "INV-001",
  status: "overdue",
  total_cents: 50000,
  paid_cents: 10000,
  due_date: "2026-01-20T00:00:00Z", // ~28 days ago from Feb 17
  client_name: "Acme Corp",
};

describe("findDueFollowups", () => {
  it("queries for due invoice_followup automations", async () => {
    const client = mockClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [AUTOMATION],
    });

    const result = await findDueFollowups(client);

    expect(result).toEqual([AUTOMATION]);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("invoice_followup")
    );
  });

  it("returns empty array when none due", async () => {
    const client = mockClient();
    const result = await findDueFollowups(client);
    expect(result).toEqual([]);
  });
});

describe("findOverdueInvoices", () => {
  it("queries invoices past due_date", async () => {
    const client = mockClient();
    (client.query as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [INVOICE],
    });

    const result = await findOverdueInvoices(client, AUTOMATION);

    expect(result).toEqual([INVOICE]);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("due_date"),
      [AUTOMATION.account_id]
    );
  });

  it("includes overdue, sent, and partial statuses in query", async () => {
    const client = mockClient();
    await findOverdueInvoices(client, AUTOMATION);

    const sql = (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sql).toContain("overdue");
    expect(sql).toContain("sent");
    expect(sql).toContain("partial");
  });

  it("returns empty array when no invoices match", async () => {
    const client = mockClient();
    const result = await findOverdueInvoices(client, AUTOMATION);
    expect(result).toEqual([]);
  });
});

describe("getCadenceSteps", () => {
  const refDate = new Date("2026-02-17T12:00:00Z");

  it("returns steps the invoice has crossed", () => {
    // Due date 28 days ago → crossed 7 and 14, not yet 30
    const dueDate = "2026-01-20T12:00:00Z";
    const steps = getCadenceSteps(dueDate, [7, 14, 30], refDate);
    expect(steps).toEqual([7, 14]);
  });

  it("returns all steps when overdue long enough", () => {
    // Due date 60 days ago → crossed all
    const dueDate = "2025-12-19T12:00:00Z";
    const steps = getCadenceSteps(dueDate, [7, 14, 30], refDate);
    expect(steps).toEqual([7, 14, 30]);
  });

  it("returns empty when not yet overdue enough for any step", () => {
    // Due date 3 days ago → crossed none with [7, 14, 30]
    const dueDate = "2026-02-14T12:00:00Z";
    const steps = getCadenceSteps(dueDate, [7, 14, 30], refDate);
    expect(steps).toEqual([]);
  });

  it("handles single-step cadence", () => {
    const dueDate = "2026-02-03T12:00:00Z"; // 14 days ago
    const steps = getCadenceSteps(dueDate, [7], refDate);
    expect(steps).toEqual([7]);
  });

  it("sorts results ascending", () => {
    const dueDate = "2025-12-19T12:00:00Z"; // 60 days ago
    const steps = getCadenceSteps(dueDate, [30, 7, 14], refDate);
    expect(steps).toEqual([7, 14, 30]);
  });

  it("uses default of [7, 14, 30] when config empty", () => {
    // Test that the calling code passes default — this tests the pure function
    const dueDate = "2026-01-20T12:00:00Z"; // 28 days ago
    const steps = getCadenceSteps(dueDate, [7, 14, 30], refDate);
    expect(steps).toEqual([7, 14]);
  });
});

describe("emitInvoiceFollowup", () => {
  it("inserts audit_log entry and returns true for new follow-up", async () => {
    const queryFn = vi.fn();
    // First call: check existing (none found)
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // Second call: insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    const result = await emitInvoiceFollowup(client, INVOICE, AUTOMATION.id, 7);

    expect(result).toBe(true);
    expect(queryFn).toHaveBeenCalledTimes(2);
    // Check the insert call
    const insertArgs = queryFn.mock.calls[1];
    expect(insertArgs[0]).toContain("INSERT INTO audit_log");
    expect(insertArgs[1][0]).toBe(INVOICE.account_id);
    expect(insertArgs[1][1]).toBe(INVOICE.id);
  });

  it("returns false and skips insert if follow-up already exists for cadence step", async () => {
    const queryFn = vi.fn();
    // First call: check existing (found one)
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    const result = await emitInvoiceFollowup(client, INVOICE, AUTOMATION.id, 7);

    expect(result).toBe(false);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("stores cadence step and invoice details in new_value", async () => {
    const queryFn = vi.fn();
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    await emitInvoiceFollowup(client, INVOICE, AUTOMATION.id, 14);

    const insertArgs = queryFn.mock.calls[1];
    const newValue = JSON.parse(insertArgs[1][3]);
    expect(newValue.automation_id).toBe(AUTOMATION.id);
    expect(newValue.days_overdue_step).toBe(14);
    expect(newValue.invoice_number).toBe(INVOICE.invoice_number);
    expect(newValue.total_cents).toBe(INVOICE.total_cents);
    expect(newValue.paid_cents).toBe(INVOICE.paid_cents);
    expect(newValue.amount_due_cents).toBe(40000);
    expect(newValue.due_date).toBe(INVOICE.due_date);
    expect(newValue.client_name).toBe(INVOICE.client_name);
    expect(newValue.followup_sent_at).toBeDefined();
  });

  it("checks idempotency using cadence step in new_value jsonb", async () => {
    const queryFn = vi.fn();
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    const client = { query: queryFn } as unknown as Client;

    await emitInvoiceFollowup(client, INVOICE, AUTOMATION.id, 7);

    // The check query should filter by days_overdue_step in the jsonb
    const checkArgs = queryFn.mock.calls[0];
    expect(checkArgs[0]).toContain("days_overdue_step");
    expect(checkArgs[1]).toContain(String(7));
  });
});

describe("markAutomationRun", () => {
  it("updates last_run_at and advances next_run_at", async () => {
    const client = mockClient();

    await markAutomationRun(client, AUTOMATION.id);

    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("last_run_at = now()"),
      [AUTOMATION.id]
    );
    expect(
      (client.query as ReturnType<typeof vi.fn>).mock.calls[0][0]
    ).toContain("next_run_at = now() + interval '1 hour'");
  });
});

describe("processInvoiceFollowup", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("processes overdue invoices and returns counts", async () => {
    const queryFn = vi.fn();
    // findOverdueInvoices: 1 invoice, 28 days overdue → steps [7, 14]
    const invoice28days: OverdueInvoice = {
      ...INVOICE,
      due_date: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
    };
    queryFn.mockResolvedValueOnce({ rows: [invoice28days] });
    // emitInvoiceFollowup for step 7: check (not exists)
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // emitInvoiceFollowup for step 7: insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // emitInvoiceFollowup for step 14: check (already exists)
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processInvoiceFollowup(client, AUTOMATION);

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.automationId).toBe(AUTOMATION.id);
  });

  it("uses default cadence [7, 14, 30] when config empty", async () => {
    const autoNoConfig: AutomationRow = {
      ...AUTOMATION,
      config: {},
    };
    const queryFn = vi.fn();
    // findOverdueInvoices: 1 invoice, 8 days overdue → step [7] with default
    const invoice8days: OverdueInvoice = {
      ...INVOICE,
      due_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    queryFn.mockResolvedValueOnce({ rows: [invoice8days] });
    // emitInvoiceFollowup for step 7: check (not exists)
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // emitInvoiceFollowup for step 7: insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processInvoiceFollowup(client, autoNoConfig);

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it("continues processing after individual invoice errors", async () => {
    const queryFn = vi.fn();
    const invoice8days: OverdueInvoice = {
      ...INVOICE,
      due_date: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    };
    // findOverdueInvoices: 2 invoices
    queryFn.mockResolvedValueOnce({
      rows: [invoice8days, { ...invoice8days, id: "inv-2" }],
    });
    // inv-1 step 7 check: throws
    queryFn.mockRejectedValueOnce(new Error("connection lost"));
    // inv-2 step 7 check: not exists
    queryFn.mockResolvedValueOnce({ rowCount: 0 });
    // inv-2 step 7 insert
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processInvoiceFollowup(client, AUTOMATION);

    expect(result.sent).toBe(1);
    expect(result.errors).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("inv-1"),
      expect.any(Error)
    );
  });

  it("marks automation run even with zero overdue invoices", async () => {
    const queryFn = vi.fn();
    // findOverdueInvoices: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processInvoiceFollowup(client, AUTOMATION);

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("skips invoices with no crossed cadence steps", async () => {
    const queryFn = vi.fn();
    // Invoice only 3 days overdue — no steps crossed with [7, 14, 30]
    const invoice3days: OverdueInvoice = {
      ...INVOICE,
      due_date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    };
    queryFn.mockResolvedValueOnce({ rows: [invoice3days] });
    // markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const result = await processInvoiceFollowup(client, AUTOMATION);

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
  });
});

describe("runInvoiceFollowups", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("returns empty array when no automations are due", async () => {
    const client = mockClient();
    const results = await runInvoiceFollowups(client);
    expect(results).toEqual([]);
  });

  it("processes each due automation independently", async () => {
    const auto2: AutomationRow = {
      ...AUTOMATION,
      id: "auto-f2",
      account_id: "acct-2",
    };

    const queryFn = vi.fn();
    // findDueFollowups: 2 automations
    queryFn.mockResolvedValueOnce({ rows: [AUTOMATION, auto2] });
    // auto-f1 findOverdueInvoices: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // auto-f1 markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });
    // auto-f2 findOverdueInvoices: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // auto-f2 markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const results = await runInvoiceFollowups(client);

    expect(results).toHaveLength(2);
    expect(results[0].automationId).toBe("auto-f1");
    expect(results[1].automationId).toBe("auto-f2");
  });

  it("continues after a failed automation", async () => {
    const auto2: AutomationRow = {
      ...AUTOMATION,
      id: "auto-f2",
      account_id: "acct-2",
    };

    const queryFn = vi.fn();
    // findDueFollowups: 2 automations
    queryFn.mockResolvedValueOnce({ rows: [AUTOMATION, auto2] });
    // auto-f1 findOverdueInvoices: throws
    queryFn.mockRejectedValueOnce(new Error("db error"));
    // auto-f2 findOverdueInvoices: none
    queryFn.mockResolvedValueOnce({ rows: [] });
    // auto-f2 markAutomationRun
    queryFn.mockResolvedValueOnce({ rowCount: 1 });

    const client = { query: queryFn } as unknown as Client;
    const results = await runInvoiceFollowups(client);

    expect(results).toHaveLength(1);
    expect(results[0].automationId).toBe("auto-f2");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("auto-f1"),
      expect.any(Error)
    );
  });
});
