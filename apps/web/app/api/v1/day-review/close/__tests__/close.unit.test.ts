import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

const DAY_ID = "00000000-0000-0000-0000-000000000010";

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

const mockWithDbSession = vi.fn();
vi.mock("@/lib/db", () => ({
  withDbSession: (...args: unknown[]) => mockWithDbSession(...args),
}));

const mockAssertDayCloseAllowed = vi.fn();
vi.mock("@/lib/day-review/close-status", () => ({
  assertDayCloseAllowed: (...args: unknown[]) => mockAssertDayCloseAllowed(...args),
}));

const mockGetBusinessDayById = vi.fn();
const mockSetBusinessDayStatus = vi.fn();
vi.mock("@/lib/operations/business-day", () => ({
  getBusinessDayById: (...args: unknown[]) => mockGetBusinessDayById(...args),
  setBusinessDayStatus: (...args: unknown[]) => mockSetBusinessDayStatus(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST as closeDay } from "../route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/day-review/close", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockWithDbSession.mockImplementation(async (_session, fn) => fn({}));
  mockGetBusinessDayById.mockResolvedValue({
    id: DAY_ID,
    status: "ACTIVE",
    business_date: "2026-07-06",
    closed_at: null,
  });
  mockAssertDayCloseAllowed.mockResolvedValue({ ok: true });
  mockSetBusinessDayStatus.mockResolvedValue({ closed_at: "2026-07-06T20:00:00Z" });
});

describe("POST /api/v1/day-review/close", () => {
  it("rejects close when checklist hard blockers remain", async () => {
    mockAssertDayCloseAllowed.mockResolvedValue({
      ok: false,
      reason: "Close Day — clock out first",
      code: "CHECKLIST_INCOMPLETE",
    });

    const res = await closeDay(request({ id: DAY_ID }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CHECKLIST_INCOMPLETE");
    expect(mockSetBusinessDayStatus).not.toHaveBeenCalled();
  });

  it("closes when checklist passes", async () => {
    const res = await closeDay(request({ id: DAY_ID }));
    expect(res.status).toBe(200);
    expect(mockAssertDayCloseAllowed).toHaveBeenCalledWith(mockSession, "2026-07-06");
    expect(mockSetBusinessDayStatus).toHaveBeenCalled();
  });
});