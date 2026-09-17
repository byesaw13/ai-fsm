/**
 * Unit tests for POST /api/v1/jobs/[id]/deposit-invoice (TASK-120 deposit gate).
 *
 * Mocks the DB client (ordinal query responses) to prove the route's branching:
 * 404 / NO_ESTIMATE / idempotent return / happy-path amount from the company %.
 * The final invoice crediting a deposit is proven separately by
 * lib/invoices/__tests__/progress-credit.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (_r: string[], h: Function) => (req: NextRequest) => h(req, mockSession),
}));

const mockClientQuery = vi.fn();
vi.mock("@/lib/invoices/db", () => ({
  withInvoiceContext: (_s: unknown, fn: (c: unknown) => unknown) => fn({ query: mockClientQuery }),
  generateInvoiceNumber: vi.fn().mockResolvedValue("INV-0007"),
}));

vi.mock("@/lib/db/audit", () => ({ appendAuditLog: vi.fn() }));

import { POST } from "../route";

const JOB = "00000000-0000-0000-0000-0000000000aa";
const URL = `http://localhost:3000/api/v1/jobs/${JOB}/deposit-invoice`;
const post = () => new NextRequest(URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

beforeEach(() => {
  mockClientQuery.mockReset();
});

describe("POST deposit-invoice", () => {
  it("404 when the job is not found", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const res = await POST(post());
    expect(res.status).toBe(404);
  });

  it("400 NO_ESTIMATE when no approved estimate is linked", async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ client_id: "C1", property_id: null, estimate_id: null, total_cents: null, deposit_cents: null, existing_deposit_id: null, final_invoice_id: null }],
      rowCount: 1,
    });
    const res = await POST(post());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("NO_ESTIMATE");
  });

  it("is idempotent — returns the existing deposit invoice without inserting", async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ client_id: "C1", property_id: null, estimate_id: "E1", total_cents: 100000, deposit_cents: 0, existing_deposit_id: "DEP1", final_invoice_id: null }],
      rowCount: 1,
    });
    const res = await POST(post());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ invoice_id: "DEP1", created: false });
    expect(mockClientQuery).toHaveBeenCalledTimes(1); // no accounts/insert queries
  });

  it("creates a draft deposit at the company standard % of the total", async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{ client_id: "C1", property_id: "P1", estimate_id: "E1", total_cents: 100000, deposit_cents: 0, existing_deposit_id: null, final_invoice_id: null }],
        rowCount: 1,
      }) // jobRow
      .mockResolvedValueOnce({ rows: [{ settings: { deposit_percent: 30 } }], rowCount: 1 }) // accounts
      .mockResolvedValueOnce({ rows: [{ id: "NEWDEP" }], rowCount: 1 }); // insert
    const res = await POST(post());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ invoice_id: "NEWDEP", amount_cents: 30000, created: true });
    // The insert carries invoice_kind='deposit' and the computed amount as total.
    const insertCall = mockClientQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO invoices"));
    expect(insertCall).toBeTruthy();
    expect(String(insertCall![0])).toContain("'deposit'");
    expect(insertCall![1]).toContain(30000);
  });

  it("uses the estimate's configured deposit over the company %", async () => {
    mockClientQuery
      .mockResolvedValueOnce({
        rows: [{ client_id: "C1", property_id: null, estimate_id: "E1", total_cents: 100000, deposit_cents: 25000, existing_deposit_id: null, final_invoice_id: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ settings: { deposit_percent: 30 } }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: "NEWDEP" }], rowCount: 1 });
    const res = await POST(post());
    expect((await res.json()).amount_cents).toBe(25000);
  });

  it("400 FINAL_EXISTS when a final invoice already exists", async () => {
    mockClientQuery.mockResolvedValueOnce({
      rows: [{ client_id: "C1", property_id: null, estimate_id: "E1", total_cents: 100000, deposit_cents: 0, existing_deposit_id: null, final_invoice_id: "FIN1" }],
      rowCount: 1,
    });
    const res = await POST(post());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("FINAL_EXISTS");
  });
});
