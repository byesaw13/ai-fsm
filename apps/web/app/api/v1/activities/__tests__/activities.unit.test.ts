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

const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };
const mockQueryForSession = vi.fn();

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
  queryForSession: (...args: unknown[]) => mockQueryForSession(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn() },
}));

import { POST as switchActivity } from "../switch/route";
import { POST as logActivity } from "../log/route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/v1/activities/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockQueryForSession.mockResolvedValue([]);
});

describe("POST /api/v1/activities/switch", () => {
  it("rejects an unknown activity type", async () => {
    const res = await switchActivity(request({ activity_type: "yoga" }));
    expect(res.status).toBe(400);
  });

  it("rejects entity_id without entity_type", async () => {
    const res = await switchActivity(
      request({ activity_type: "job_work", entity_id: "00000000-0000-0000-0000-000000000003" })
    );
    expect(res.status).toBe(400);
  });

  it("closes the active entry and starts the new one", async () => {
    const calls: string[] = [];
    mockClientQuery.mockImplementation((sql: string) => {
      calls.push(sql);
      if (sql.includes("FOR UPDATE")) {
        return Promise.resolve({
          rows: [{ id: "prev-1", activity_type: "travel", entity_type: null, entity_id: null, assignment_kind: null }],
        });
      }
      if (sql.includes("INSERT INTO activity_entries")) {
        return Promise.resolve({ rows: [{ id: "new-1", started_at: "2026-06-11T12:00:00Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await switchActivity(request({ activity_type: "job_work" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.closed_previous).toBe(true);
    expect(calls.some((c) => c.includes("SET ended_at = now()"))).toBe(true);
    expect(calls.some((c) => c.includes("INSERT INTO activity_entries"))).toBe(true);
    expect(calls.some((c) => c.includes("time_clock_sessions") && c.includes("UPDATE"))).toBe(false);
  });

  it("is idempotent when already doing the same activity and assignment", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) {
        return Promise.resolve({
          rows: [{ id: "cur-1", activity_type: "job_work", entity_type: null, entity_id: null, assignment_kind: "office" }],
        });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await switchActivity(request({ activity_type: "job_work", assignment_kind: "office" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.unchanged).toBe(true);
  });

  it("switches verb on the same assignment without touching payroll", async () => {
    const visitId = "00000000-0000-0000-0000-000000000003";
    const calls: string[] = [];
    mockClientQuery.mockImplementation((sql: string) => {
      calls.push(sql);
      if (sql.includes("FOR UPDATE")) {
        return Promise.resolve({
          rows: [{
            id: "cur-1",
            activity_type: "job_work",
            entity_type: "visit",
            entity_id: visitId,
            assignment_kind: null,
          }],
        });
      }
      if (sql.includes("INSERT INTO activity_entries")) {
        return Promise.resolve({ rows: [{ id: "new-1", started_at: "2026-06-11T12:00:00Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await switchActivity(request({
      activity_type: "travel",
      entity_type: "visit",
      entity_id: visitId,
    }));
    expect(res.status).toBe(201);
    const insert = calls.find((c) => c.includes("INSERT INTO activity_entries"));
    expect(insert).toBeTruthy();
    expect(calls.some((c) => c.includes("time_clock_sessions") && c.includes("UPDATE"))).toBe(false);
  });

  it("switches assignment_kind while keeping the same verb", async () => {
    const calls: string[] = [];
    mockClientQuery.mockImplementation((sql: string) => {
      calls.push(sql);
      if (sql.includes("FOR UPDATE")) {
        return Promise.resolve({
          rows: [{ id: "cur-1", activity_type: "admin", entity_type: null, entity_id: null, assignment_kind: "office" }],
        });
      }
      if (sql.includes("INSERT INTO activity_entries")) {
        return Promise.resolve({ rows: [{ id: "new-2", started_at: "2026-06-11T12:00:00Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await switchActivity(request({ activity_type: "admin", assignment_kind: "shop" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.closed_previous).toBe(true);
    const insertCall = calls.find((c) => c.includes("INSERT INTO activity_entries"));
    expect(insertCall).toBeTruthy();
  });

  it("rejects entity and assignment_kind together", async () => {
    const res = await switchActivity(request({
      activity_type: "admin",
      entity_type: "job",
      entity_id: "00000000-0000-0000-0000-000000000003",
      assignment_kind: "office",
    }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/activities/log", () => {
  it("rejects ended_at before started_at", async () => {
    const res = await logActivity(
      request({ activity_type: "travel", started_at: "2026-06-11T12:00:00Z", ended_at: "2026-06-11T11:00:00Z" })
    );
    expect(res.status).toBe(400);
  });

  it("rejects future segments", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    const res = await logActivity(
      request({ activity_type: "travel", started_at: new Date().toISOString(), ended_at: future })
    );
    expect(res.status).toBe(400);
  });

  it("logs a valid completed segment", async () => {
    mockQueryForSession.mockResolvedValue([{ id: "seg-1" }]);
    const res = await logActivity(
      request({
        activity_type: "material_run",
        started_at: "2026-06-11T10:00:00Z",
        ended_at: "2026-06-11T10:25:00Z",
        source: "auto_material_run",
      })
    );
    expect(res.status).toBe(201);
  });
});
