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

const materialLineItemsFromJobExpenses = vi.fn().mockResolvedValue([]);
const appendMaterialsFromJobExpenses = vi.fn().mockResolvedValue({
  lineItems: [],
  skipped: 0,
});
const equipmentLineItemsFromJobExpenses = vi.fn().mockResolvedValue([]);
const appendEquipmentFromJobExpenses = vi.fn().mockResolvedValue({
  lineItems: [],
});

vi.mock("@/lib/invoices/job-expenses", () => ({
  materialLineItemsFromJobExpenses: (...args: unknown[]) =>
    materialLineItemsFromJobExpenses(...args),
  appendMaterialsFromJobExpenses: (...args: unknown[]) =>
    appendMaterialsFromJobExpenses(...args),
  equipmentLineItemsFromJobExpenses: (...args: unknown[]) =>
    equipmentLineItemsFromJobExpenses(...args),
  appendEquipmentFromJobExpenses: (...args: unknown[]) =>
    appendEquipmentFromJobExpenses(...args),
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
    materialLineItemsFromJobExpenses.mockResolvedValue([]);
    appendMaterialsFromJobExpenses.mockResolvedValue({ lineItems: [], skipped: 0 });
    equipmentLineItemsFromJobExpenses.mockResolvedValue([]);
    appendEquipmentFromJobExpenses.mockResolvedValue({ lineItems: [] });
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
          pricing_mode: "flat_rate",
          booking_pricing_mode: null,
          subtotal_cents: 25000,
          tax_cents: 0,
          total_cents: 25000,
          estimate_notes: null,
          deposit_cents: 0,
          travel_snapshot_id: null,
        }],
        rowCount: 1,
      },
      // Estimate line items: none
      { rows: [], rowCount: 0 },
      // Tracked time: none
      { rows: [{ tracked_minutes: "0" }], rowCount: 1 },
      // Visit parts (job-level): none
      { rows: [], rowCount: 0 },
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
          pricing_mode: "flat_rate",
          booking_pricing_mode: null,
          subtotal_cents: 50000,
          tax_cents: 0,
          total_cents: 50000,
          estimate_notes: "Replace faucet",
          deposit_cents: 15000,
          travel_snapshot_id: null,
        }],
        rowCount: 1,
      },
      // Estimate line items
      {
        rows: [
          { description: "Labor", quantity: "2", unit_price_cents: 15000, line_item_type: "labor", sort_order: 0 },
          { description: "Parts", quantity: "1", unit_price_cents: 20000, line_item_type: "materials", sort_order: 1 },
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
          pricing_mode: "flat_rate",
          booking_pricing_mode: null,
          subtotal_cents: 30000,
          tax_cents: 0,
          total_cents: 30000,
          estimate_notes: null,
          deposit_cents: 0,
          travel_snapshot_id: null,
        }],
        rowCount: 1,
      },
      // Tracked time: none
      { rows: [{ tracked_minutes: "0" }], rowCount: 1 },
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
      // Visit completed_at (due upon completion)
      { rows: [{ completed_at: "2026-07-09T15:00:00.000Z" }], rowCount: 1 },
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

  it("creates a labor-only invoice from completed visit time when there are no estimate items or parts", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    const client = makeClient([
      // Guard: no existing final invoice
      { rows: [], rowCount: 0 },
      // Job with no approved estimate
      {
        rows: [{
          client_id: "client-1",
          property_id: null,
          estimate_id: null,
          presentation_mode: null,
          pricing_mode: null,
          booking_pricing_mode: null,
          subtotal_cents: null,
          tax_cents: null,
          total_cents: null,
          estimate_notes: null,
          deposit_cents: null,
          travel_snapshot_id: null,
        }],
        rowCount: 1,
      },
      // Tracked time: 130 minutes rounds to 2.25 hours
      { rows: [{ tracked_minutes: "130" }], rowCount: 1 },
      // business_pricing_settings (bill rate for labor line)
      {
        rows: [{
          labor_cost_cents_per_hour: 5000,
          labor_billing_cents_per_hour: 11500,
          margin_floor_pct: 0.3,
          ma_labor_rate_delta: 0.15,
          minimum_service_fee_cents: 18500,
          half_day_rate_cents: 51500,
          full_day_rate_cents: 98000,
        }],
        rowCount: 1,
      },
      // Visit parts (job-level): none
      { rows: [], rowCount: 0 },
      // Invoice INSERT
      { rows: [{ id: "labor-inv-id" }], rowCount: 1 },
      // Labor line INSERT
      { rows: [{ id: "labor-line-id" }], rowCount: 1 },
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-1",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result?.invoiceId).toBe("labor-inv-id");
    expect(result?.lineItemCount).toBe(1);

    const insertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoices")
    );
    const args = insertCall![1] as unknown[];
    expect(args[6]).toBe(25875);
    expect(args[8]).toBe(25875);

    const lineInsertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoice_line_items")
    );
    expect(lineInsertCall?.[1]).toEqual([
      "labor-inv-id",
      "Labor",
      2.25,
      11500,
      25875,
      "labor",
      0,
    ]);
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
          pricing_mode: "flat_rate",
          booking_pricing_mode: null,
          subtotal_cents: 40000,
          tax_cents: 0,
          total_cents: 40000,
          estimate_notes: null,
          deposit_cents: 10000,
          travel_snapshot_id: null,
        }],
        rowCount: 1,
      },
      // One line item
      {
        rows: [{ description: "Work", quantity: "1", unit_price_cents: 40000, line_item_type: "labor", sort_order: 0 }],
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

  it("T&M: bills tracked hours at estimate labor rate, not estimate budget lines", async () => {
    const { createDraftFinalInvoiceForJob } = await import("../final-invoice");

    // Budget on estimate is large; only 10 hours tracked → bill 10h @ $115 + materials
    materialLineItemsFromJobExpenses.mockResolvedValue([
      {
        description: "Materials — Home Depot",
        quantity: 1,
        unit_price_cents: 34000,
        line_item_type: "materials" as const,
        sort_order: 1,
        source_expense_id: "exp-1",
      },
    ]);
    appendMaterialsFromJobExpenses.mockResolvedValue({
      lineItems: [
        {
          id: "mat-line",
          invoice_id: "tm-inv",
          description: "Materials — Home Depot",
          quantity: 1,
          unit_price_cents: 34000,
          total_cents: 34000,
          line_item_type: "materials" as const,
          sort_order: 1,
        },
      ],
      skipped: 0,
    });
    equipmentLineItemsFromJobExpenses.mockResolvedValue([
      {
        description: "Lift rental",
        quantity: 1,
        unit_price_cents: 175600,
        line_item_type: "materials" as const,
        sort_order: 2,
        source_expense_id: "exp-lift",
      },
    ]);
    appendEquipmentFromJobExpenses.mockResolvedValue({
      lineItems: [
        {
          id: "eq-line",
          invoice_id: "tm-inv",
          description: "Lift rental",
          quantity: 1,
          unit_price_cents: 175600,
          total_cents: 175600,
          line_item_type: "materials" as const,
          sort_order: 2,
        },
      ],
    });

    // 10h × $115 + $340 materials + $1,756 lift = $3,246
    const actualTotal = 115000 + 34000 + 175600;

    const client = makeClient([
      { rows: [], rowCount: 0 }, // guard
      {
        rows: [{
          client_id: "client-1",
          property_id: "prop-1",
          estimate_id: "est-tm",
          presentation_mode: "standard",
          pricing_mode: "hourly_internal",
          booking_pricing_mode: null,
          // Estimate budget — must NOT become the invoice total
          subtotal_cents: 1_035_000,
          tax_cents: 0,
          total_cents: 1_035_000,
          estimate_notes: "T&M budget",
          deposit_cents: 50000,
          travel_snapshot_id: null,
        }],
        rowCount: 1,
      },
      // Tracked time: 10 hours exact
      { rows: [{ tracked_minutes: "600" }], rowCount: 1 },
      // Labor rate from estimate labor line ($115/hr)
      { rows: [{ unit_price_cents: 11500 }], rowCount: 1 },
      // Deposit invoices ($500 already billed)
      {
        rows: [{ invoice_number: "DEP-TM", total_cents: 50000, status: "paid" }],
        rowCount: 1,
      },
      // Invoice INSERT
      { rows: [{ id: "tm-inv" }], rowCount: 1 },
      // Labor line INSERT
      { rows: [{ id: "labor-line" }], rowCount: 1 },
      // recalculateInvoiceTotals: SUM line items
      { rows: [{ subtotal_cents: String(actualTotal) }], rowCount: 1 },
      // recalculateInvoiceTotals: UPDATE invoices
      {
        rows: [{
          subtotal_cents: actualTotal,
          tax_cents: 0,
          total_cents: actualTotal,
          paid_cents: 0,
          balance_cents: actualTotal - 50000,
        }],
        rowCount: 1,
      },
      // Re-query deposits after materials/equipment append
      {
        rows: [{ invoice_number: "DEP-TM", total_cents: 50000, status: "paid" }],
        rowCount: 1,
      },
      // Update deposit_cents / notes after materials
      { rows: [], rowCount: 1 },
    ]);

    const result = await createDraftFinalInvoiceForJob({
      client,
      jobId: "job-tm",
      accountId: "acct-1",
      userId: "user-1",
    });

    expect(result?.invoiceId).toBe("tm-inv");
    // Labor + materials + equipment from append
    expect(result?.lineItemCount).toBe(3);
    expect(appendMaterialsFromJobExpenses).toHaveBeenCalled();
    expect(appendEquipmentFromJobExpenses).toHaveBeenCalled();

    // Actuals include lift — not the $10,350 estimate
    const insertCall = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("INSERT INTO invoices")
    );
    const args = insertCall![1] as unknown[];
    expect(args[6]).toBe(actualTotal); // subtotal
    expect(args[8]).toBe(actualTotal); // total
    expect(args[9]).toBe(50000); // deposit credit

    // Labor line uses tracked hours at estimate rate, not budget quantity 90
    const laborInsert = (client.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        (call[0] as string).includes("INSERT INTO invoice_line_items") &&
        Array.isArray(call[1]) &&
        (call[1] as unknown[])[1] === "Labor"
    );
    expect(laborInsert?.[1]).toEqual([
      "tm-inv",
      "Labor",
      10,
      11500,
      115000,
      "labor",
      0,
    ]);

    // Customer-visible estimate budget lines must not be loaded as invoice lines
    const estimateLineLoads = (client.query as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" &&
        (call[0] as string).includes("FROM estimate_line_items") &&
        (call[0] as string).includes("visible_to_customer")
    );
    expect(estimateLineLoads).toHaveLength(0);
  });
});

