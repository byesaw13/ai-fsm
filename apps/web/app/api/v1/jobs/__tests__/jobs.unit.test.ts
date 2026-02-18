import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the auth middleware so we can control session injection in tests
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
// Mock the DB layer so no real connections are made
// ---------------------------------------------------------------------------
const mockQuery = vi.fn();
const mockQueryOne = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPool = {
  connect: vi.fn(),
};

vi.mock("../../../../../lib/db", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  getPool: () => mockPool,
}));

vi.mock("../../../../../lib/db/audit", () => ({
  appendAuditLog: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import route handlers after mocks are set up
// ---------------------------------------------------------------------------
import { GET as jobList, POST as jobCreate } from "../route";
import { GET as jobGet, PATCH as jobPatch, DELETE as jobDelete } from "../[id]/route";
import { POST as jobTransition } from "../[id]/transition/route";

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
}

const BASE = "http://localhost:3000/api/v1/jobs";
const JOB_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CLIENT_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const SAMPLE_JOB = {
  id: JOB_ID,
  account_id: mockSession.accountId,
  client_id: CLIENT_ID,
  title: "Fix roof",
  status: "draft",
  priority: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

beforeEach(() => {
  // resetAllMocks drains mockResolvedValueOnce queues from prior tests
  // (clearAllMocks only clears call history, not implementation queues)
  vi.resetAllMocks();
  // Re-setup persistent mock implementations after reset
  mockPool.connect.mockResolvedValue({ query: mockClientQuery, release: mockClientRelease });
  // Default transaction response: BEGIN / SET LOCAL / COMMIT etc.
  mockClientQuery.mockResolvedValue({ rows: [] });
});

// ---------------------------------------------------------------------------
// GET /api/v1/jobs — list
// ---------------------------------------------------------------------------
describe("GET /api/v1/jobs", () => {
  it("returns 200 with job array", async () => {
    mockQuery.mockResolvedValue([SAMPLE_JOB]);
    const res = await jobList(makeRequest("GET", BASE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe(JOB_ID);
  });

  it("returns 200 with empty array when no jobs", async () => {
    mockQuery.mockResolvedValue([]);
    const res = await jobList(makeRequest("GET", BASE));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/jobs — create
// ---------------------------------------------------------------------------
describe("POST /api/v1/jobs", () => {
  it("returns 201 with created job on valid body", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [SAMPLE_JOB] }) // INSERT
      .mockResolvedValueOnce({ rows: [] }) // appendAuditLog (mocked but client.query still called)
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await jobCreate(
      makeRequest("POST", BASE, { client_id: CLIENT_ID, title: "Fix roof" })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.title).toBe("Fix roof");
  });

  it("returns 422 when title is missing", async () => {
    const res = await jobCreate(
      makeRequest("POST", BASE, { client_id: CLIENT_ID })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when client_id is not a UUID", async () => {
    const res = await jobCreate(
      makeRequest("POST", BASE, { client_id: "not-a-uuid", title: "Fix roof" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/jobs/[id] — detail
// ---------------------------------------------------------------------------
describe("GET /api/v1/jobs/[id]", () => {
  it("returns 200 with job when found", async () => {
    mockQueryOne.mockResolvedValue(SAMPLE_JOB);
    const res = await jobGet(makeRequest("GET", `${BASE}/${JOB_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.id).toBe(JOB_ID);
  });

  it("returns 404 when job not found", async () => {
    mockQueryOne.mockResolvedValue(null);
    const res = await jobGet(makeRequest("GET", `${BASE}/${JOB_ID}`));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/jobs/[id] — delete
// ---------------------------------------------------------------------------
describe("DELETE /api/v1/jobs/[id]", () => {
  it("returns 204 when deleting a draft job", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_JOB, status: "draft" }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // appendAuditLog
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await jobDelete(makeRequest("DELETE", `${BASE}/${JOB_ID}`));
    expect(res.status).toBe(204);
  });

  it("returns 409 when deleting a non-draft job", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_JOB, status: "invoiced" }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await jobDelete(makeRequest("DELETE", `${BASE}/${JOB_ID}`));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CONFLICT");
  });

  it("returns 404 when job not found for delete", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE — empty
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await jobDelete(makeRequest("DELETE", `${BASE}/${JOB_ID}`));
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/jobs/[id]/transition — status transition
// ---------------------------------------------------------------------------
describe("POST /api/v1/jobs/[id]/transition", () => {
  it("returns 200 on valid transition draft → quoted", async () => {
    const updated = { ...SAMPLE_JOB, status: "quoted" };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_JOB, status: "draft" }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }) // appendAuditLog
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await jobTransition(
      makeRequest("POST", `${BASE}/${JOB_ID}/transition`, { status: "quoted" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("quoted");
  });

  it("returns 422 on invalid transition invoiced → draft", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_JOB, status: "invoiced" }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await jobTransition(
      makeRequest("POST", `${BASE}/${JOB_ID}/transition`, { status: "draft" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_TRANSITION");
  });

  it("returns 422 on unknown target status", async () => {
    const res = await jobTransition(
      makeRequest("POST", `${BASE}/${JOB_ID}/transition`, { status: "flying" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 when job not found for transition", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [] }) // SELECT FOR UPDATE — empty
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await jobTransition(
      makeRequest("POST", `${BASE}/${JOB_ID}/transition`, { status: "quoted" })
    );
    expect(res.status).toBe(404);
  });
});
