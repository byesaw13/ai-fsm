import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (h: Function) => (req: NextRequest) => h(req, mockSession),
  withRole: (_r: string[], h: Function) => (req: NextRequest) => h(req, mockSession),
}));

const mockClientQuery = vi.fn();
vi.mock("@/lib/invoices/db", () => ({
  withInvoiceContext: (_s: unknown, fn: (c: unknown) => unknown) => fn({ query: mockClientQuery }),
}));

const mockLoad = vi.fn();
const mockCreateLink = vi.fn();
vi.mock("@/lib/integrations/square", () => ({
  loadSquareSettings: (...a: unknown[]) => mockLoad(...a),
  createSquarePaymentLink: (...a: unknown[]) => mockCreateLink(...a),
}));

vi.mock("@/lib/db/audit", () => ({ appendAuditLog: vi.fn() }));

import { POST } from "../route";

const INVOICE = "00000000-0000-0000-0000-0000000000bb";
const URL = `http://localhost:3000/api/v1/invoices/${INVOICE}/square-link`;
function post(body: unknown): NextRequest {
  return new NextRequest(URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const PAYABLE_INVOICE = {
  id: INVOICE,
  status: "sent",
  invoice_number: "INV-0001",
  total_cents: 100000,
  paid_cents: 0,
  deposit_cents: 0,
  balance_cents: 100000,
  client_id: "C1",
  job_id: null,
};

const ENABLED_SETTINGS = {
  enabled: true,
  environment: "sandbox",
  config: { locationId: "LOC1", applicationId: "APP1", webhookUrl: null },
  secrets: { accessToken: "tok", webhookSignatureKey: "whk" },
  status: "connected",
  statusDetail: null,
  lastCheckedAt: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("POST /api/v1/invoices/[id]/square-link", () => {
  it("400 when requesting a deposit link but the invoice has no deposit", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [PAYABLE_INVOICE], rowCount: 1 }); // SELECT ... FOR UPDATE
    const res = await POST(post({ kind: "deposit" }));
    expect(res.status).toBe(400);
  });

  it("412 when Square is not enabled", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [PAYABLE_INVOICE], rowCount: 1 });
    mockLoad.mockResolvedValue({ ...ENABLED_SETTINGS, enabled: false });
    const res = await POST(post({ kind: "balance" }));
    expect(res.status).toBe(412);
  });

  it("creates a balance link and records a pending payment", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [PAYABLE_INVOICE], rowCount: 1 }) // SELECT invoice FOR UPDATE
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })               // UPDATE invoices square_*
      .mockResolvedValueOnce({ rows: [{ id: "PAYROW" }], rowCount: 1 }); // INSERT pending payment
    mockLoad.mockResolvedValue(ENABLED_SETTINGS);
    mockCreateLink.mockResolvedValue({ url: "https://sq/checkout/PL1", orderId: "ORD1", paymentLinkId: "PL1" });

    const res = await POST(post({ kind: "balance" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.url).toBe("https://sq/checkout/PL1");

    // link created for the full balance
    expect(mockCreateLink).toHaveBeenCalledWith(ENABLED_SETTINGS, expect.objectContaining({ amountCents: 100000 }));
    // a PENDING square payment row is inserted
    const insert = mockClientQuery.mock.calls.find((c) => /INSERT INTO payments/.test(String(c[0])));
    expect(insert).toBeTruthy();
    expect(String(insert![0])).toMatch(/'pending'/);
  });

  it("rejects a custom amount above the remaining balance", async () => {
    mockClientQuery.mockResolvedValueOnce({ rows: [PAYABLE_INVOICE], rowCount: 1 });
    mockLoad.mockResolvedValue(ENABLED_SETTINGS);
    const res = await POST(post({ kind: "custom", amount_cents: 200000 }));
    expect(res.status).toBe(400);
  });
});
