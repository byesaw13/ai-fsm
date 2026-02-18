import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock auth middleware — inject controlled session
// ---------------------------------------------------------------------------
const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("../../../../../lib/auth/middleware", () => ({
  withAuth: (handler: Function) => (req: NextRequest) => handler(req, mockSession),
  withRole: (_roles: string[], handler: Function) => (req: NextRequest) => handler(req, mockSession),
}));

// ---------------------------------------------------------------------------
// Mock DB layer — no real connections
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = { connect: vi.fn() };

vi.mock("../../../../../lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  getPool: () => mockPool,
}));

vi.mock("../../../../../lib/db/audit", () => ({
  appendAuditLog: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import route handlers (after mocks)
// ---------------------------------------------------------------------------
import { GET as visitList, POST as visitCreate } from "../../jobs/[id]/visits/route";
import { GET as visitGet, PATCH as visitPatch } from "../[id]/route";
import { POST as visitTransition } from "../[id]/transition/route";

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

const JOBS_BASE = "http://localhost:3000/api/v1/jobs";
const VISITS_BASE = "http://localhost:3000/api/v1/visits";
const JOB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const VISIT_ID = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const NOW = new Date().toISOString();

const SAMPLE_VISIT = {
  id: VISIT_ID,
  account_id: mockSession.accountId,
  job_id: JOB_ID,
  assigned_user_id: USER_ID,
  status: "scheduled",
  scheduled_start: NOW,
  scheduled_end: NOW,
  arrived_at: null,
  completed_at: null,
  tech_notes: null,
  created_at: NOW,
  updated_at: NOW,
};

beforeEach(() => {
  // resetAllMocks drains mockResolvedValueOnce queues between tests
  vi.resetAllMocks();
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  mockClientQuery.mockResolvedValue({ rows: [] });
});

// ---------------------------------------------------------------------------
// GET /api/v1/jobs/[jobId]/visits — list
// ---------------------------------------------------------------------------
describe("GET /api/v1/jobs/[jobId]/visits", () => {
  it("returns 200 with visit array", async () => {
    mockQuery.mockResolvedValue([SAMPLE_VISIT]);
    const res = await visitList(makeRequest("GET", `${JOBS_BASE}/${JOB_ID}/visits`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(VISIT_ID);
  });

  it("returns 200 with empty array when no visits", async () => {
    mockQuery.mockResolvedValue([]);
    const res = await visitList(makeRequest("GET", `${JOBS_BASE}/${JOB_ID}/visits`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/jobs/[jobId]/visits — create
// ---------------------------------------------------------------------------
describe("POST /api/v1/jobs/[jobId]/visits", () => {
  it("returns 201 with created visit on valid body", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, {
        scheduled_start: NOW,
        scheduled_end: NOW,
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe(VISIT_ID);
  });

  it("returns 422 when scheduled_start is missing", async () => {
    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, { scheduled_end: NOW })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when scheduled_end is missing", async () => {
    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, { scheduled_start: NOW })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/visits/[id] — detail
// ---------------------------------------------------------------------------
describe("GET /api/v1/visits/[id]", () => {
  it("returns 200 when visit found", async () => {
    mockQueryOne.mockResolvedValue(SAMPLE_VISIT);
    const res = await visitGet(makeRequest("GET", `${VISITS_BASE}/${VISIT_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(VISIT_ID);
  });

  it("returns 404 when visit not found", async () => {
    mockQueryOne.mockResolvedValue(null);
    const res = await visitGet(makeRequest("GET", `${VISITS_BASE}/${VISIT_ID}`));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/visits/[id] — update with role-scoped fields
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/visits/[id]", () => {
  it("owner can update assigned_user_id → 200", async () => {
    const updated = { ...SAMPLE_VISIT, assigned_user_id: USER_ID };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await visitPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}`, { assigned_user_id: USER_ID })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.assigned_user_id).toBe(USER_ID);
  });

  it("tech can update tech_notes → 200", async () => {
    // Temporarily set session role to tech
    Object.assign(mockSession, { role: "tech" });

    const updated = { ...SAMPLE_VISIT, tech_notes: "Done!" };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await visitPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}`, { tech_notes: "Done!" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.tech_notes).toBe("Done!");

    // Restore session role
    Object.assign(mockSession, { role: "owner" });
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/visits/[id]/transition — status transitions
// ---------------------------------------------------------------------------
describe("POST /api/v1/visits/[id]/transition", () => {
  it("scheduled → arrived with assigned tech → 200", async () => {
    const updated = { ...SAMPLE_VISIT, status: "arrived", arrived_at: NOW };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "scheduled", assigned_user_id: USER_ID }] }) // SELECT
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "arrived" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("arrived");
  });

  it("arrived → in_progress → 200", async () => {
    const updated = { ...SAMPLE_VISIT, status: "in_progress" };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "arrived" }] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "in_progress" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("in_progress");
  });

  it("in_progress → completed → 200", async () => {
    const updated = { ...SAMPLE_VISIT, status: "completed", completed_at: NOW };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "in_progress" }] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, {
        status: "completed",
        tech_notes: "All done",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("completed");
  });

  it("arrived → completed is invalid → 422 INVALID_TRANSITION", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "arrived" }] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "completed" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_TRANSITION");
  });

  it("completed → scheduled is terminal → 422 INVALID_TRANSITION", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "completed" }] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "scheduled" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_TRANSITION");
  });

  it("scheduled → arrived without assigned_user_id → 422 PRECONDITION_FAILED", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "scheduled", assigned_user_id: null }] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "arrived" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("PRECONDITION_FAILED");
  });

  it("unknown target status → 422 VALIDATION_ERROR", async () => {
    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "flying" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("visit not found → 404", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }) // SELECT returns empty
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "arrived" })
    );
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });
});
