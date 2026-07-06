import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQueryForSession = vi.fn();
vi.mock("@/lib/db", () => ({
  queryForSession: (...args: unknown[]) => mockQueryForSession(...args),
}));

import { assertDayCloseAllowed } from "../close-status";

const session = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "trace",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockQueryForSession.mockImplementation(async (_s, sql: string) => {
    if (sql.includes("time_clock_sessions")) return [{ status: "open" }];
    if (sql.includes("activity_entries")) return [];
    if (sql.includes("vehicle_sessions")) return [];
    if (sql.includes("expenses")) return [{ count: "0" }];
    if (sql.includes("visits")) return [{ count: "0" }];
    return [];
  });
});

describe("assertDayCloseAllowed (TASK-054 server gate)", () => {
  it("blocks when payroll clock is still open", async () => {
    const result = await assertDayCloseAllowed(session, "2026-07-06");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("CHECKLIST_INCOMPLETE");
      expect(result.reason).toContain("clock");
    }
  });

  it("allows close when hard blockers are clear", async () => {
    mockQueryForSession.mockImplementation(async (_s, sql: string) => {
      if (sql.includes("time_clock_sessions")) return [];
      if (sql.includes("activity_entries")) return [];
      if (sql.includes("vehicle_sessions")) return [];
      if (sql.includes("expenses")) return [{ count: "0" }];
      if (sql.includes("visits")) return [{ count: "0" }];
      return [];
    });
    const result = await assertDayCloseAllowed(session, "2026-07-06");
    expect(result).toEqual({ ok: true });
  });
});