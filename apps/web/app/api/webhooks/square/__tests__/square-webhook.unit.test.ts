import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mocks: DB pool, crypto, and the Square signature verifier.
// ---------------------------------------------------------------------------
const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = {
  query: (...a: unknown[]) => mockPoolQuery(...a),
  connect: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

vi.mock("@/lib/crypto", () => ({
  decryptJson: vi.fn(() => ({ accessToken: "tok", webhookSignatureKey: "whk" })),
}));

const mockVerify = vi.fn();
vi.mock("@/lib/integrations/square-payments", () => ({
  verifySquareWebhook: (...a: unknown[]) => mockVerify(...a),
}));

import { POST } from "../route";

const ACCOUNT = "00000000-0000-0000-0000-0000000000aa";
const INVOICE = "00000000-0000-0000-0000-0000000000bb";

function req(body: unknown, sig: string | null = "sig"): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig) headers["x-square-hmacsha256-signature"] = sig;
  return new NextRequest("https://app/api/webhooks/square", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// Default: a configured Square account is found by location id.
function settingsFound() {
  mockPoolQuery.mockResolvedValue({
    rowCount: 1,
    rows: [{ account_id: ACCOUNT, enabled: true, secrets: Buffer.from("x"), webhook_url: null }],
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockVerify.mockResolvedValue(true);
});

describe("POST /api/webhooks/square — guards", () => {
  it("400 when the signature header is missing", async () => {
    const res = await POST(req({ type: "payment.updated" }, null));
    expect(res.status).toBe(400);
  });

  it("acks (200) and does nothing when no location id is present", async () => {
    const res = await POST(req({ type: "payment.updated", data: { object: { payment: {} } } }));
    expect(res.status).toBe(200);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });

  it("400 when the signature fails verification", async () => {
    settingsFound();
    mockVerify.mockResolvedValue(false);
    const res = await POST(
      req({ type: "payment.updated", data: { object: { payment: { id: "P1", status: "COMPLETED", location_id: "LOC1", order_id: "ORD1" } } } })
    );
    expect(res.status).toBe(400);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/square — payment.updated COMPLETED", () => {
  const evt = {
    type: "payment.updated",
    data: { object: { payment: { id: "P1", status: "COMPLETED", location_id: "LOC1", order_id: "ORD1", amount_money: { amount: 5000 } } } },
  };

  it("completes the pending link row and acks", async () => {
    settingsFound();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })            // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })            // dup check → none
      .mockResolvedValueOnce({ rows: [{ id: INVOICE }], rowCount: 1 }) // invoice by order id
      .mockResolvedValueOnce({ rows: [{ id: "PAYROW" }], rowCount: 1 }) // pending row found
      .mockResolvedValueOnce({ rows: [{ id: "PAYROW", amount_cents: 5000 }], rowCount: 1 }) // UPDATE → paid
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })            // workflow_events payment.recorded
      .mockResolvedValueOnce({ rows: [{ status: "paid" }], rowCount: 1 }) // invoice status
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })            // workflow_events invoice.paid
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });           // COMMIT

    const res = await POST(req(evt));
    expect(res.status).toBe(200);
    const sql = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /UPDATE payments/.test(s) && /status = 'paid'/.test(s))).toBe(true);
    expect(sql.some((s) => /invoice\.paid/.test(s))).toBe(true);
    expect(sql.some((s) => /COMMIT/.test(s))).toBe(true);
  });

  it("ignores a duplicate payment (idempotent)", async () => {
    settingsFound();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // BEGIN
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 }) // dup check → found
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });         // COMMIT

    const res = await POST(req(evt));
    expect(res.status).toBe(200);
    const sql = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /UPDATE payments/.test(s))).toBe(false);
    expect(sql.some((s) => /INSERT INTO payments/.test(s))).toBe(false);
  });

  it("does nothing for a non-completed payment", async () => {
    settingsFound();
    const res = await POST(
      req({ type: "payment.updated", data: { object: { payment: { id: "P1", status: "APPROVED", location_id: "LOC1" } } } })
    );
    expect(res.status).toBe(200);
    expect(mockPool.connect).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/square — refund.updated COMPLETED", () => {
  const evt = {
    type: "refund.updated",
    data: { object: { refund: { id: "R1", status: "COMPLETED", location_id: "LOC1", payment_id: "P1", order_id: "ORD1", amount_money: { amount: 1500 } } } },
  };

  it("records a ledger-only refund row attributed to the original payment", async () => {
    settingsFound();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // dup check → none
      .mockResolvedValueOnce({ rows: [{ invoice_id: INVOICE, account_id: ACCOUNT, client_id: "C1", job_id: null, created_by: "U1" }], rowCount: 1 }) // original payment
      .mockResolvedValueOnce({ rows: [{ id: "REFROW" }], rowCount: 1 }) // INSERT refund row
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })          // workflow_events payment.recorded
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });         // COMMIT

    const res = await POST(req(evt));
    expect(res.status).toBe(200);
    const calls = mockClientQuery.mock.calls;
    const insert = calls.find((c) => /INSERT INTO payments/.test(String(c[0])));
    expect(insert).toBeTruthy();
    // payment_type 'refund', status 'refunded' baked into the SQL
    expect(String(insert![0])).toMatch(/'refund', 'refunded'/);
    // workflow event carries paymentType refund
    const wf = calls.find((c) => /payment\.recorded/.test(String(c[0])));
    expect(String(wf![1])).toMatch(/refund/);
  });

  it("ignores a duplicate refund (idempotent)", async () => {
    settingsFound();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })          // BEGIN
      .mockResolvedValueOnce({ rows: [{ "?column?": 1 }], rowCount: 1 }) // dup → found
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });         // COMMIT
    const res = await POST(req(evt));
    expect(res.status).toBe(200);
    const sql = mockClientQuery.mock.calls.map((c) => String(c[0]));
    expect(sql.some((s) => /INSERT INTO payments/.test(s))).toBe(false);
  });
});
