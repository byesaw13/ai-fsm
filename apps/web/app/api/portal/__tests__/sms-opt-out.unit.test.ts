import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockPool = {
  connect: vi.fn(),
};

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
}));

const ACCOUNT_ID  = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_ID   = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CLIENT_TOKEN = "tok_test_abc123";

function makeRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/portal/${token}/sms-opt-out`, {
    method: "POST",
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockQuery, release: mockRelease });
});

describe("POST /api/portal/[clientToken]/sms-opt-out", () => {
  it("200 — clears consent and logs to communications_log", async () => {
    const { POST } = await import("../[clientToken]/sms-opt-out/route");

    mockQuery
      .mockResolvedValueOnce({ rows: [] })  // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID, account_id: ACCOUNT_ID, sms_consent: true }] }) // SELECT client
      .mockResolvedValueOnce({ rows: [] })  // UPDATE clients
      .mockResolvedValueOnce({ rows: [] })  // set_config
      .mockResolvedValueOnce({ rows: [] })  // INSERT communications_log
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await POST(makeRequest(CLIENT_TOKEN), {
      params: Promise.resolve({ clientToken: CLIENT_TOKEN }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(mockRelease).toHaveBeenCalled();
  });

  it("404 — token not found", async () => {
    const { POST } = await import("../[clientToken]/sms-opt-out/route");

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SELECT client → not found
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await POST(makeRequest("bad-token"), {
      params: Promise.resolve({ clientToken: "bad-token" }),
    });

    expect(res.status).toBe(404);
    expect(mockRelease).toHaveBeenCalled();
  });

  it("409 — already opted out", async () => {
    const { POST } = await import("../[clientToken]/sms-opt-out/route");

    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: CLIENT_ID, account_id: ACCOUNT_ID, sms_consent: false }] }) // SELECT client — already opted out
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await POST(makeRequest(CLIENT_TOKEN), {
      params: Promise.resolve({ clientToken: CLIENT_TOKEN }),
    });

    expect(res.status).toBe(409);
    expect(mockRelease).toHaveBeenCalled();
  });
});
