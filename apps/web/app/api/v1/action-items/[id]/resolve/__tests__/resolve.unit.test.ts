import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { OWNER_PROMISE_ACTION_TYPE } from "@ai-fsm/domain";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as "owner" | "admin" | "tech",
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withRole: (roles: string[], handler: Function) => async (request: NextRequest) => {
    if (!roles.includes(mockSession.role)) {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Forbidden", traceId: mockSession.traceId } },
        { status: 403 },
      );
    }
    return handler(request, mockSession);
  },
}));

const mockQueryForSession = vi.fn();

vi.mock("@/lib/db", () => ({
  queryForSession: (...args: unknown[]) => mockQueryForSession(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { PATCH, POST } from "../route";

const ITEM_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BASE = `http://localhost:3000/api/v1/action-items/${ITEM_ID}/resolve`;

function makeRequest(method: "POST" | "PATCH" = "POST", headers?: Record<string, string>): NextRequest {
  return new NextRequest(BASE, {
    method,
    headers: { accept: "application/json", ...headers },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSession.role = "owner";
});

describe("POST /api/v1/action-items/[id]/resolve", () => {
  it("requires owner or admin", async () => {
    mockSession.role = "tech";
    const res = await POST(makeRequest());
    expect(res.status).toBe(403);
    expect(mockQueryForSession).not.toHaveBeenCalled();
  });

  it("returns 404 when the row is missing or on another account", async () => {
    mockQueryForSession.mockResolvedValueOnce([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
    expect(mockQueryForSession).toHaveBeenCalledTimes(1);
    expect(mockQueryForSession.mock.calls[0][1]).toMatch(/FROM action_items/i);
    expect(mockQueryForSession.mock.calls[0][2]).toEqual([
      ITEM_ID,
      mockSession.accountId,
      OWNER_PROMISE_ACTION_TYPE,
    ]);
  });

  it("returns 404 for an invalid id", async () => {
    const res = await POST(
      new NextRequest("http://localhost:3000/api/v1/action-items/not-a-uuid/resolve", {
        method: "POST",
        headers: { accept: "application/json" },
      }),
    );
    expect(res.status).toBe(404);
    expect(mockQueryForSession).not.toHaveBeenCalled();
  });

  it("sets resolved_at and resolved_by on an open owner_promise", async () => {
    mockQueryForSession
      .mockResolvedValueOnce([
        {
          id: ITEM_ID,
          resolved_at: null,
          resolved_by: null,
          action_type: OWNER_PROMISE_ACTION_TYPE,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: ITEM_ID,
          resolved_at: "2026-09-01T12:00:00.000Z",
          resolved_by: mockSession.userId,
        },
      ]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        id: ITEM_ID,
        resolved_at: "2026-09-01T12:00:00.000Z",
        resolved_by: mockSession.userId,
      },
    });

    const updateSql = String(mockQueryForSession.mock.calls[1][1]);
    expect(updateSql).toMatch(/UPDATE action_items/i);
    expect(updateSql).toMatch(/resolved_at\s*=\s*now\(\)/i);
    expect(updateSql).toMatch(/resolved_by/i);
    expect(updateSql).not.toMatch(/DELETE/i);
    expect(updateSql).not.toMatch(/capture_evidence/i);
    expect(mockQueryForSession.mock.calls[1][2]).toEqual([
      mockSession.userId,
      ITEM_ID,
      mockSession.accountId,
    ]);
  });

  it("is idempotent when the row is already resolved", async () => {
    const existing = {
      id: ITEM_ID,
      resolved_at: "2026-08-30T00:00:00.000Z",
      resolved_by: "00000000-0000-0000-0000-000000000099",
      action_type: OWNER_PROMISE_ACTION_TYPE,
    };
    mockQueryForSession.mockResolvedValueOnce([existing]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      data: {
        id: ITEM_ID,
        resolved_at: existing.resolved_at,
        resolved_by: existing.resolved_by,
      },
    });
    expect(mockQueryForSession).toHaveBeenCalledTimes(1);
    expect(String(mockQueryForSession.mock.calls[0][1])).not.toMatch(/UPDATE/i);
  });

  it("redirects HTML form posts back to the promise queue", async () => {
    mockQueryForSession.mockResolvedValueOnce([
      {
        id: ITEM_ID,
        resolved_at: "2026-08-30T00:00:00.000Z",
        resolved_by: mockSession.userId,
        action_type: OWNER_PROMISE_ACTION_TYPE,
      },
    ]);

    const res = await POST(
      makeRequest("POST", {
        accept: "text/html,application/xhtml+xml",
        "content-type": "application/x-www-form-urlencoded",
      }),
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/app/action-queue?promises=1");
  });
});

describe("PATCH /api/v1/action-items/[id]/resolve", () => {
  it("shares the POST handler", async () => {
    expect(PATCH).toBe(POST);
  });
});
