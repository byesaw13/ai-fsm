import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "user-1",
  accountId: "account-1",
  role: "owner" as "owner" | "admin" | "tech",
  traceId: "trace-1",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (request: NextRequest) => handler(request, mockSession),
}));

const mockClientQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  withDbSession: (_session: unknown, fn: (client: unknown) => Promise<unknown>) =>
    fn({ query: mockClientQuery }),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

vi.mock("@/lib/jobs/buy-list-seed", () => ({
  hydrateBuyListLocations: async (
    _client: unknown,
    _accountId: string,
    lines: Array<Record<string, unknown>>,
  ) => lines,
}));

import { POST } from "../route";

function makePost(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/jobs/job-1/materials/build", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const templateRow = {
  id: "t1",
  price_book_id: "pb1",
  price_book_code: "2005",
  price_book_name: "Toilet replacement",
  catalog_material_id: null,
  material_name: "Toilet wax ring (reinforced)",
  quantity_type: "static",
  quantity_flat: 1,
  input_key: null,
  quantity_multiplier: null,
  waste_factor: 1,
  role: "must_buy",
  unit_label: "ea",
  store_section: "Plumbing",
  sort_order: 10,
  unit_cost_cents: null,
  supplier: null,
  preferred_vendor: null,
  product_url: null,
  search_query: null,
  sku: null,
  aisle: null,
  bay: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.role = "owner";
});

describe("POST /api/v1/jobs/[id]/materials/build", () => {
  it("returns 403 for techs", async () => {
    mockSession.role = "tech";
    const res = await POST(makePost({ price_book_codes: ["2005"] }));
    expect(res.status).toBe(403);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("returns 422 NO_TEMPLATES when codes have no packs", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makePost({ price_book_codes: ["9999"] }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("NO_TEMPLATES");
  });

  it("previews without inserting", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [templateRow] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const res = await POST(makePost({ price_book_codes: ["2005"], commit: false }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.mode).toBe("preview");
    expect(json.data.lines[0].name).toContain("wax ring");
    expect(mockClientQuery.mock.calls.some((c) => String(c[0]).includes("INSERT"))).toBe(false);
  });

  it("skips needed duplicates on commit", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: "job-1" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [templateRow] })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ name: "Toilet wax ring (reinforced)", unit_label: "ea", status: "needed" }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ m: "0" }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const res = await POST(makePost({ price_book_codes: ["2005"], commit: true }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.inserted).toBe(0);
    expect(json.data.skipped[0].name).toContain("wax ring");
    expect(mockClientQuery.mock.calls.some((c) => String(c[0]).includes("INSERT INTO job_material_lines"))).toBe(
      false,
    );
  });
});
