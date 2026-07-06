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
import { PATCH as patchSegment } from "../segments/[id]/route";
import { PATCH as patchVisitCandidate } from "../../visit-candidates/[id]/route";
import { GET as getNeedsJobLink } from "../needs-job-link/route";

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


  it("audits a trimmed neighbour via rebalance", async () => {
    mockClientQuery.mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.includes("FOR UPDATE")) {
        const id = params?.[0];
        return Promise.resolve({ rows: [{ ...EXISTING, id: id === MANUAL_ID ? MANUAL_ID : EXISTING.id }] });
      }
      if (sql.startsWith("UPDATE activity_entries") && sql.includes("RETURNING id")) {
        const id = params?.[2];
        return Promise.resolve({ rows: [{ ...EXISTING, id: id === MANUAL_ID ? MANUAL_ID : EXISTING.id, ended_at: params?.[1] ?? EXISTING.ended_at }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await editActivity(req("/api/v1/activities/" + EXISTING.id, "PATCH", {
      started_at: "2026-06-11T12:00:00.000Z",
      ended_at: "2026-06-11T15:00:00.000Z",
      rebalance: [{ id: MANUAL_ID, ended_at: "2026-06-11T12:00:00.000Z" }],
    }));

    expect(res.status).toBe(200);
    expect(mockAppendAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity_type: "activity_entry",
      entity_id: MANUAL_ID,
      action: "update",
    }));
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


const SEGMENT_ID = "33333333-3333-3333-3333-333333333333";
const MANUAL_ID = "44444444-4444-4444-4444-444444444444";

const PROVISIONAL_SEGMENT = {
  id: SEGMENT_ID,
  kind: "stop",
  segment_date: "2026-06-11",
  started_at: "2026-06-11T12:00:00.000Z",
  ended_at: "2026-06-11T13:00:00.000Z",
  place_label: "Smith kitchen",
  status: "provisional",
  activity_entry_id: null,
  vehicle_session_id: null,
};

const DRIVE_SEGMENT = {
  ...PROVISIONAL_SEGMENT,
  kind: "drive" as const,
  place_label: "Driving",
  vehicle_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  distance_meters: 19912,
};

describe("PATCH /api/v1/activities/segments/[id]", () => {
  it("confirm_trip creates linked travel entry and mileage session", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [DRIVE_SEGMENT] });
      if (sql.includes("FROM vehicles")) return Promise.resolve({ rows: [{ id: DRIVE_SEGMENT.vehicle_id }] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) return Promise.resolve({ rows: [] });
      if (sql.includes("FROM business_days")) return Promise.resolve({ rows: [{ id: "day-1" }] });
      if (sql.startsWith("INSERT INTO activity_entries")) return Promise.resolve({ rows: [{ id: "entry-trip" }] });
      if (sql.startsWith("INSERT INTO vehicle_sessions")) return Promise.resolve({ rows: [{ id: "sess-trip" }] });
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm_trip",
      vehicle_id: DRIVE_SEGMENT.vehicle_id,
      miles: 12.4,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.activity_entry_id).toBe("entry-trip");
    expect(json.data.vehicle_session_id).toBe("sess-trip");
    expect(json.data.miles_source).toBe("bt_gps_estimate");
  });

  it("keeps rejecting overlap without an accepted rebalance", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID, started_at: "2026-06-11T11:00:00.000Z", ended_at: "2026-06-11T14:00:00.000Z" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
    }));

    expect(res.status).toBe(409);
  });


  it("rejects a rebalance that does not cover every current overlap", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID }, { id: "55555555-5555-5555-5555-555555555555" }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
      rebalance: [{ id: MANUAL_ID, delete: true }],
    }));

    expect(res.status).toBe(409);
    expect(mockClientQuery.mock.calls.some((call) => String(call[0]).startsWith("INSERT INTO activity_entries"))).toBe(false);
  });

  it("rejects a rebalance for an unrelated activity", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
      rebalance: [{ id: "99999999-9999-9999-9999-999999999999", delete: true }],
    }));

    expect(res.status).toBe(409);
    expect(mockClientQuery.mock.calls.some((call) => String(call[0]).startsWith("INSERT INTO activity_entries"))).toBe(false);
  });


  it("rejects a rebalance payload when there is no current overlap", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
      rebalance: [{ id: MANUAL_ID, delete: true }],
    }));

    expect(res.status).toBe(409);
    expect(mockClientQuery.mock.calls.some((call) => String(call[0]).startsWith("INSERT INTO activity_entries"))).toBe(false);
  });

  it("confirms an overlapping segment when rebalance is accepted and audits the replaced manual row", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM location_segments")) return Promise.resolve({ rows: [PROVISIONAL_SEGMENT] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID, started_at: "2026-06-11T11:00:00.000Z", ended_at: "2026-06-11T12:00:00.000Z" }] });
      }
      if (sql.startsWith("INSERT INTO activity_entries")) return Promise.resolve({ rows: [{ id: "new-segment-entry" }] });
      if (sql.startsWith("DELETE FROM activity_entries")) {
        return Promise.resolve({ rows: [{ ...EXISTING, id: MANUAL_ID }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await patchSegment(req(`/api/v1/activities/segments/${SEGMENT_ID}`, "PATCH", {
      action: "confirm",
      activity_type: "job_work",
      rebalance: [{ id: MANUAL_ID, delete: true }],
    }));

    expect(res.status).toBe(200);
    expect(mockAppendAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity_type: "activity_entry",
      entity_id: MANUAL_ID,
      action: "delete",
    }));
  });
});


const CANDIDATE_ID = "55555555-5555-5555-5555-555555555555";
const VISIT_ID = "66666666-6666-6666-6666-666666666666";

const PENDING_CANDIDATE = {
  id: CANDIDATE_ID,
  status: "pending",
  location_segment_id: SEGMENT_ID,
  property_id: "77777777-7777-7777-7777-777777777777",
  matched_client_id: "88888888-8888-8888-8888-888888888888",
  job_id: null,
  visit_id: VISIT_ID,
  arrival_time: "2026-06-11T12:00:00.000Z",
  departure_time: "2026-06-11T13:00:00.000Z",
};

describe("PATCH /api/v1/visit-candidates/[id]", () => {
  it("confirms an overlapping visit candidate when rebalance is accepted", async () => {
    mockClientQuery.mockImplementation((sql: string) => {
      if (sql.includes("FROM visit_candidates")) return Promise.resolve({ rows: [PENDING_CANDIDATE] });
      if (sql.includes("FROM activity_entries") && sql.includes("FOR UPDATE")) {
        return Promise.resolve({ rows: [{ id: MANUAL_ID, started_at: "2026-06-11T11:00:00.000Z", ended_at: "2026-06-11T12:00:00.000Z" }] });
      }
      if (sql.startsWith("INSERT INTO activity_entries")) return Promise.resolve({ rows: [{ id: "new-visit-entry" }] });
      if (sql.startsWith("DELETE FROM activity_entries")) return Promise.resolve({ rows: [{ ...EXISTING, id: MANUAL_ID }] });
      return Promise.resolve({ rows: [] });
    });

    const res = await patchVisitCandidate(req(`/api/v1/visit-candidates/${CANDIDATE_ID}`, "PATCH", {
      action: "confirm",
      classification: "job_work",
      rebalance: [{ id: MANUAL_ID, delete: true }],
    }));

    expect(res.status).toBe(200);
    const insertCall = mockClientQuery.mock.calls.find((call) => String(call[0]).startsWith("INSERT INTO activity_entries"));
    expect(insertCall?.[1]).toContain("visit");
    expect(insertCall?.[1]).toContain(VISIT_ID);
    expect(mockAppendAuditLog).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity_id: MANUAL_ID,
      action: "delete",
    }));
  });
});


describe("GET /api/v1/activities/needs-job-link", () => {
  it("returns confirmed costing activities with no business link", async () => {
    const rows = [{
      id: "99999999-9999-9999-9999-999999999999",
      activity_type: "travel",
      started_at: "2026-06-11T12:00:00.000Z",
      ended_at: "2026-06-11T13:00:00.000Z",
      note: "Drive to Smith",
    }];
    const db = await import("@/lib/db");
    vi.mocked(db.queryForSession).mockResolvedValue(rows);

    const res = await getNeedsJobLink(req("/api/v1/activities/needs-job-link?date=2026-06-11", "GET"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: { activities: rows } });
    expect(vi.mocked(db.queryForSession).mock.calls[0][1]).toContain("entity_id IS NULL");
    expect(vi.mocked(db.queryForSession).mock.calls[0][2]).toEqual([mockSession.accountId, "2026-06-11"]);
  });
});
