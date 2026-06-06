/**
 * Unit tests for createDraftFinalInvoiceForJob
 *
 * Tests the shared invoice-creation logic that is used by both visit
 * completion and job completion paths. All tests use a mock PoolClient
 * so no database connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PoolClient } from "pg";

// ── Mock dependencies ──────────────────────────────────────────────────────

vi.mock("@/lib/invoices/db", () => ({
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-0042"),
}));

vi.mock("@/lib/db/audit", () => ({
  appendAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// ── Shared mock client factory ─────────────────────────────────────────────

function makeClient(queryResults: unknown[]): PoolClient {
  let callIndex = 0;
  return {
    query: vi.fn().mockImplementation(() => {
      const result = queryResults[callIndex++];
      return Promise.resolve(result ?? { rows: [], rowCount: 0 });
    }),
  } as unknown as PoolClient;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("createDraftFinalInvoiceForJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null if a final invoice already exists for the job", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    const client = makeClient([
      // Guard check: final invoice found
      { rows: [{ id: "existing-inv-id" }], rowCount: 1 },
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result).toBeNull();
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it("returns null if no line items and no visit parts", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    const client = makeClient([
      // Guard: no final invoice
      { rows: [], rowCount: 0 },
      // Job + estimate query
      {
        rows: [{
          client_id: "client-1",
          property_id: null,
          estimate_id: "est-1",
          presentation_mode: "standard",
          subtotal_cents: 25000,
          tax_cents: 0,
          total_cents: 25000,
          estimate_notes: null,
          deposit_cents: 0,
        }],
        rowCount: 1,
      },
      // Estimate line items: none
      { rows: [], rowCount: 0 },
      // No visitId so no parts fallback
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result).toBeNull();
  });

  it("creates invoice with estimate line items and correct deposit credit", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    const client = makeClient([
      // Guard: no existing final invoice
      { rows: [], rowCount: 0 },
      // Job + estimate
      {
        rows: [{
          client_id: "client-1",
          property_id: "prop-1",
          estimate_id: "est-1",
          presentation_mode: "standard",
          subtotal_cents: 50000,
          tax_cents: 0,
          total_cents: 50000,
          estimate_notes: "Replace faucet",
          deposit_cents: 15000,
        }],
        rowCount: 1,
      },
      // Estimate line items
      {
        rows: [
          { description: "Labor", quantity: "2", unit_price_cents: 15000, sort_order: 0 },
          { description: "Parts", quantity: "1", unit_price_cents: 20000, sort_order: 1 },
        ],
        rowCount: 2,
      },
      // Deposit invoices for reconciliation
      {
        rows: [{ invoice_number: "INV-0010", total_cents: 15000, status: "sent" }],
        rowCount: 1,
      },
      // Invoice INSERT
      { rows: [{ id: "new-inv-id" }], rowCount: 1 },
      // Line item 1 INSERT
      { rows: [], rowCount: 1 },
      // Line item 2 INSERT
      { rows: [], rowCount: 1 },
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result).not.toBeNull();
    expect(result?.invoiceId).toBe("new-inv-id");
    expect(result?.lineItemCount).toBe(2);

    // Verify the invoice INSERT was called with the deposit credit
    const insertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoices")
    );
    expect(insertCall).toBeDefined();
    // deposit_cents arg ($10) should be 15000 (the live deposit credit)
    const args = insertCall![1] as unknown[];
    const depositCentsArg = args[9]; // $10 is index 9
    expect(depositCentsArg).toBe(15000);
  });

  it("skips estimate items for multi_option estimates and uses visit parts instead", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    const client = makeClient([
      // Guard: no existing final invoice
      { rows: [], rowCount: 0 },
      // Job + estimate (multi_option)
      {
        rows: [{
          client_id: "client-1",
          property_id: null,
          estimate_id: "est-1",
          presentation_mode: "multi_option",
          subtotal_cents: 30000,
          tax_cents: 0,
          total_cents: 30000,
          estimate_notes: null,
          deposit_cents: 0,
        }],
        rowCount: 1,
      },
      // Visit parts (fallback)
      {
        rows: [
          { name: "PVC pipe", quantity: "2", customer_price_cents: 1500 },
          { name: "Labor charge", quantity: "1", customer_price_cents: 12000 },
        ],
        rowCount: 2,
      },
      // Deposit invoices: none
      { rows: [], rowCount: 0 },
      // Invoice INSERT
      { rows: [{ id: "parts-inv-id" }], rowCount: 1 },
      // Line items
      { rows: [], rowCount: 1 },
      { rows: [], rowCount: 1 },
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-1",
      accountId: "acct-1",
      userId: "user-1",
      visitId: "visit-1",
    });

    expect(result).not.toBeNull();
    expect(result?.invoiceId).toBe("parts-inv-id");
    expect(result?.lineItemCount).toBe(2);

    // Verify that estimate line items were NOT queried (multi_option skips them)
    const estimateItemCalls = (client.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("estimate_line_items")
    );
    expect(estimateItemCalls).toHaveLength(0);
  });

  it("excludes voided deposit invoices from the deposit credit", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    const client = makeClient([
      // Guard: no existing final invoice
      { rows: [], rowCount: 0 },
      // Job + estimate
      {
        rows: [{
          client_id: "client-1",
          property_id: null,
          estimate_id: "est-1",
          presentation_mode: "standard",
          subtotal_cents: 40000,
          tax_cents: 0,
          total_cents: 40000,
          estimate_notes: null,
          deposit_cents: 10000,
        }],
        rowCount: 1,
      },
      // One line item
      {
        rows: [{ description: "Work", quantity: "1", unit_price_cents: 40000, sort_order: 0 }],
        rowCount: 1,
      },
      // Deposit invoices: one voided, one live
      {
        rows: [
          { invoice_number: "DEP-001", total_cents: 10000, status: "void" },
          { invoice_number: "DEP-002", total_cents: 5000, status: "sent" },
        ],
        rowCount: 2,
      },
      // Invoice INSERT
      { rows: [{ id: "inv-id" }], rowCount: 1 },
      // Line item INSERT
      { rows: [], rowCount: 1 },
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result?.invoiceId).toBe("inv-id");

    // Only DEP-002 (5000) should be credited — DEP-001 is voided
    const insertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoices")
    );
    const args = insertCall![1] as unknown[];
    expect(args[9]).toBe(5000); // deposit_cents = only the live deposit
  });
});
