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

vi.mock("@/lib/db", () => ({
  getPool: () => mockPool,
  queryForSession: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

const mockAppendAuditLog = vi.fn();
vi.mock("@/lib/db/audit", () => ({
  appendAuditLog: (...args: unknown[]) => mockAppendAuditLog(...args),
}));

import { PATCH as editActivity, DELETE as deleteActivity } from "../[id]/route";
import { POST as splitActivity } from "../[id]/split/route";
import { POST as insertActivity } from "../insert/route";

const EXISTING = {
  id: "11111111-1111-1111-1111-111111111111",
  activity_type: "travel",
  category: "revenue",
  started_at: "2026-06-11T11:00:00.000Z",
  ended_at: "2026-06-11T16:00:00.000Z",
  entity_type: null,
  entity_id: null,
  note: null,
};

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
  mockAppendAuditLog.mockResolvedValue(undefined);
});

describe("PATCH /api/v1/activities/[id]", () => {
  it("rejects an unknown activity type", async () => {
    const res = await editActivity(req("/api/v1/activities/" + EXISTING.id, "PATCH", { activity_type: "yoga" }));
    expect(res.status).toBe(400);
  });

  it("edits the row and writes an audit entry with the original values", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [EXISTING] });
      if (sql.startsWith("UPDATE activity_entries")) return Promise.resolve({ rows: [{ ...EXISTING, activity_type: "job_work", category: "revenue" }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await editActivity(req("/api/v1/activities/" + EXISTING.id, "PATCH", {
      activity_type: "job_work",
      started_at: "2026-06-11T12:00:00.000Z",
      ended_at: "2026-06-11T15:00:00.000Z",
      reason: "wrong type",
    }));
    expect(res.status).toBe(200);
    expect(mockAppendAuditLog).toHaveBeenCalledTimes(1);
    const entry = mockAppendAuditLog.mock.calls[0][1];
    expect(entry.entity_type).toBe("activity_entry");
    expect(entry.action).toBe("update");
    expect(entry.old_value.activity_type).toBe("travel");
    expect(entry.new_value.reason).toBe("wrong type");
  });

  it("rejects ended_at before started_at", async () => {
    mockClientQuery.mockImplementation((sql: string) =>
      sql.includes("FOR UPDATE") ? Promise.resolve({ rows: [EXISTING] }) : Promise.resolve({ rows: [] })
    );
    const res = await editActivity(req("/api/v1/activities/" + EXISTING.id, "PATCH", {
      started_at: "2026-06-11T15:00:00.000Z",
      ended_at: "2026-06-11T12:00:00.000Z",
    }));
    expect(res.status).toBe(400);
  });

  it("drops an engulfed neighbour via rebalance and audits the delete", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [EXISTING] });
      if (sql.startsWith("UPDATE activity_entries")) return Promise.resolve({ rows: [EXISTING] });
      if (sql.startsWith("DELETE FROM activity_entries")) {
        return Promise.resolve({ rows: [{ ...EXISTING, id: "22222222-2222-2222-2222-222222222222", activity_type: "admin" }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await editActivity(req("/api/v1/activities/" + EXISTING.id, "PATCH", {
      started_at: "2026-06-11T10:00:00.000Z",
      ended_at: "2026-06-11T18:00:00.000Z",
      rebalance: [{ id: "22222222-2222-2222-2222-222222222222", delete: true }],
    }));
    expect(res.status).toBe(200);
    // One audit for the edit, one for the rebalance-dropped neighbour.
    expect(mockAppendAuditLog).toHaveBeenCalledTimes(2);
    const actions = mockAppendAuditLog.mock.calls.map((c) => c[1].action);
    expect(actions).toContain("update");
    expect(actions).toContain("delete");
  });

  it("404s when the entry does not exist", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });
    const res = await editActivity(req("/api/v1/activities/" + EXISTING.id, "PATCH", { note: "x" }));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/v1/activities/[id]", () => {
  it("hard-deletes and audits the original row", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [EXISTING] });
      if (sql.startsWith("DELETE FROM activity_entries")) return Promise.resolve({ rows: [{ id: EXISTING.id }] });
      return Promise.resolve({ rows: [] });
    });
    const res = await deleteActivity(req("/api/v1/activities/" + EXISTING.id, "DELETE", { reason: "accident" }));
    expect(res.status).toBe(200);
    const entry = mockAppendAuditLog.mock.calls[0][1];
    expect(entry.action).toBe("delete");
    expect(entry.old_value.activity_type).toBe("travel");
    expect(entry.new_value.reason).toBe("accident");
  });
});

describe("POST /api/v1/activities/[id]/split", () => {
  it("rejects fewer than two segments", async () => {
    const res = await splitActivity(req(`/api/v1/activities/${EXISTING.id}/split`, "POST", {
      segments: [{ activity_type: "travel", ended_at: EXISTING.ended_at }],
    }));
    expect(res.status).toBe(400);
  });

  it("reshapes the original and inserts the remaining segments", async () => {
    const inserted: string[] = [];
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [EXISTING] });
      if (sql.startsWith("INSERT INTO activity_entries")) {
        const id = `seg-${inserted.length + 1}`;
        inserted.push(id);
        return Promise.resolve({ rows: [{ id }] });
      }
      return Promise.resolve({ rows: [] });
    });
    const res = await splitActivity(req(`/api/v1/activities/${EXISTING.id}/split`, "POST", {
      segments: [
        { activity_type: "travel", ended_at: "2026-06-11T12:00:00.000Z" },
        { activity_type: "job_work", ended_at: "2026-06-11T15:00:00.000Z" },
        { activity_type: "travel", ended_at: EXISTING.ended_at },
      ],
    }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.inserted_ids).toHaveLength(2);
    expect(mockAppendAuditLog).toHaveBeenCalledTimes(1);
  });

  it("rejects a final segment that does not end with the block", async () => {
    mockClientQuery.mockImplementation((sql: string) =>
      sql.includes("FOR UPDATE") ? Promise.resolve({ rows: [EXISTING] }) : Promise.resolve({ rows: [] })
    );
    const res = await splitActivity(req(`/api/v1/activities/${EXISTING.id}/split`, "POST", {
      segments: [
        { activity_type: "travel", ended_at: "2026-06-11T12:00:00.000Z" },
        { activity_type: "job_work", ended_at: "2026-06-11T14:00:00.000Z" },
      ],
    }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/activities/insert", () => {
  it("inserts a bounded segment and audits it", async () => {
    mockClientQuery.mockImplementation((sql: string) =>
      sql.startsWith("INSERT INTO activity_entries")
        ? Promise.resolve({ rows: [{ id: "new-1" }] })
        : Promise.resolve({ rows: [] })
    );
    const res = await insertActivity(req("/api/v1/activities/insert", "POST", {
      activity_type: "material_run",
      started_at: "2026-06-11T14:00:00.000Z",
      ended_at: "2026-06-11T14:30:00.000Z",
    }));
    expect(res.status).toBe(201);
    expect(mockAppendAuditLog.mock.calls[0][1].action).toBe("insert");
  });

  it("rejects ended_at before started_at", async () => {
    const res = await insertActivity(req("/api/v1/activities/insert", "POST", {
      activity_type: "material_run",
      started_at: "2026-06-11T14:30:00.000Z",
      ended_at: "2026-06-11T14:00:00.000Z",
    }));
    expect(res.status).toBe(400);
  });
});
