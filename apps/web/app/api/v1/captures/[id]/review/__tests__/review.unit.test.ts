import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

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

const { mockQuery, mockWithDbSession } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockWithDbSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  withDbSession: (...args: unknown[]) => mockWithDbSession(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST as reviewCapture } from "../route";

const CAPTURE_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ENTITY_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ACTION_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const captureRow = {
  id: CAPTURE_ID,
  processing_state: "proposed",
  snooze_count: 0,
  proposed_title: "Call Mrs. Chen about the deposit",
  proposed_due_at: "2026-09-02T16:00:00.000Z",
  confirmed_at: null,
  dismissed_at: null,
};

function request(body?: unknown, id = CAPTURE_ID): NextRequest {
  return new NextRequest(`http://localhost/api/v1/captures/${id}/review`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSession.role = "owner";
  mockWithDbSession.mockImplementation(async (_session, fn) => fn({ query: mockQuery }));
});

describe("POST /api/v1/captures/[id]/review", () => {
  it("returns 403 for tech", async () => {
    mockSession.role = "tech";
    const res = await reviewCapture(request({ action: "dismiss" }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");
    expect(mockWithDbSession).not.toHaveBeenCalled();
  });

  it("returns 422 when confirm has no entity", async () => {
    const res = await reviewCapture(request({ action: "confirm" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(mockWithDbSession).not.toHaveBeenCalled();
  });

  it("confirms by inserting an owner_promise action_item and marking the capture confirmed", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [captureRow] })
      .mockResolvedValueOnce({ rows: [{ id: ENTITY_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ACTION_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: CAPTURE_ID }] });

    const res = await reviewCapture(
      request({
        action: "confirm",
        entity_type: "job",
        entity_id: ENTITY_ID,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.actionItemId).toBe(ACTION_ID);

    const insertSql = mockQuery.mock.calls[2][0] as string;
    const insertParams = mockQuery.mock.calls[2][1] as unknown[];
    expect(insertSql).toContain("INSERT INTO action_items");
    expect(insertSql).toContain("source_capture_id");
    expect(insertParams).toEqual([
      mockSession.accountId,
      "job",
      ENTITY_ID,
      "owner_promise",
      "Call Mrs. Chen about the deposit",
      "2026-09-02T16:00:00.000Z",
      CAPTURE_ID,
    ]);

    const updateSql = mockQuery.mock.calls[3][0] as string;
    expect(updateSql).toContain("processing_state = 'confirmed'");
    expect(updateSql).toContain("confirmed_at = now()");
    expect(updateSql).not.toContain("transcript");
  });

  it("uses corrected title and due_at from the body", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [captureRow] })
      .mockResolvedValueOnce({ rows: [{ id: ENTITY_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: ACTION_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: CAPTURE_ID }] });

    const res = await reviewCapture(
      request({
        action: "correct",
        entity_type: "estimate",
        entity_id: ENTITY_ID,
        title: "Send trim price this week",
        due_at: "2026-09-05",
      }),
    );

    expect(res.status).toBe(200);
    const insertParams = mockQuery.mock.calls[2][1] as unknown[];
    expect(insertParams[1]).toBe("estimate");
    expect(insertParams[4]).toBe("Send trim price this week");
    expect(insertParams[5]).toBe("2026-09-05T12:00:00.000Z");
  });

  it("does not mark the capture confirmed when the action_items insert fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [captureRow] })
      .mockResolvedValueOnce({ rows: [{ id: ENTITY_ID }] })
      .mockRejectedValueOnce(new Error("insert failed"));

    const res = await reviewCapture(
      request({
        action: "confirm",
        entity_type: "job",
        entity_id: ENTITY_ID,
      }),
    );

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error.code).toBe("INTERNAL_ERROR");
    expect(
      mockQuery.mock.calls.some((call) => String(call[0]).includes("processing_state = 'confirmed'")),
    ).toBe(false);
  });

  it("rejects a second snooze", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...captureRow, snooze_count: 1, processing_state: "snoozed" }],
    });

    const res = await reviewCapture(request({ action: "snooze" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("ALREADY_SNOOZED");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("dismisses as not a commitment", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [captureRow] })
      .mockResolvedValueOnce({ rows: [{ id: CAPTURE_ID }] });

    const res = await reviewCapture(request({ action: "dismiss" }));
    expect(res.status).toBe(200);
    const updateSql = mockQuery.mock.calls[1][0] as string;
    expect(updateSql).toContain("dismissed_at = now()");
    expect(updateSql).toContain("processing_state = 'dismissed'");
    expect(updateSql).not.toContain("transcript");
  });
});
