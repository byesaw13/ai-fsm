import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

vi.mock("@/lib/auth/permissions", () => ({
  canManageExpenses: () => true,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { POST } from "../scan-receipt/route";

function requestWithFile(file: File): NextRequest {
  const form = new FormData();
  form.append("receipt", file);
  return new NextRequest("http://localhost/api/v1/expenses/scan-receipt", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  mockCreate.mockReset();
});

describe("POST /api/v1/expenses/scan-receipt", () => {
  it("returns itemized line items alongside totals", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor_name: "Home Depot",
            amount_cents: 4400,
            expense_date: "2026-07-10",
            category: "materials",
            notes: "Deck repair run",
            line_items: [
              { name: "2x4 lumber", quantity: 10, unit_cost_cents: 400, sku: "12345" },
              { name: "Deck screws", quantity: 1, unit_cost_cents: 400, sku: null },
            ],
          }),
        },
      ],
    });

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const res = await POST(requestWithFile(file));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.vendor_name).toBe("Home Depot");
    expect(json.data.line_items).toEqual([
      { name: "2x4 lumber", quantity: 10, unit_cost_cents: 400, sku: "12345" },
      { name: "Deck screws", quantity: 1, unit_cost_cents: 400, sku: null },
    ]);
  });

  it("returns an empty line_items array when the AI omits them, without failing the scan", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            vendor_name: "Shell",
            amount_cents: 4000,
            expense_date: "2026-07-10",
            category: "fuel",
            notes: null,
          }),
        },
      ],
    });

    const file = new File(["fake"], "receipt.jpg", { type: "image/jpeg" });
    const res = await POST(requestWithFile(file));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.line_items).toEqual([]);
  });
});
