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

// Also mock the @/ alias path used by lib/visits/checklist.ts
vi.mock("@/lib/db", () => ({
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
import { GET as checklistGet } from "../[id]/checklist/route";
import { PATCH as checklistPatch } from "../[id]/checklist/[itemId]/route";

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
const BOOKING_REQUEST_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const WORK_ORDER_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
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

/** Mocks emitted by syncWorkOrderStatus after a successful INSERT. */
function appendPostInsertSyncMocks(chain: ReturnType<typeof vi.fn>) {
  return chain
    .mockResolvedValueOnce({ rows: [] }) // audit log
    .mockResolvedValueOnce({ rows: [] }) // job status advance (optional)
    .mockResolvedValueOnce({ rows: [{ status: "ready", completion_criteria: [] }] }) // sync: lock WO
    .mockResolvedValueOnce({ rows: [] }) // sync: load visits
    .mockResolvedValueOnce({ rows: [] }); // COMMIT
}

beforeEach(() => {
  // resetAllMocks drains mockResolvedValueOnce queues between tests
  vi.resetAllMocks();
  Object.assign(mockSession, { role: "owner" });
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
    appendPostInsertSyncMocks(
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ status: "quoted" }] }) // SELECT job status
        .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // SELECT active visits
        .mockResolvedValueOnce({ rows: [{ id: WORK_ORDER_ID }] }) // resolve work order
        .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }), // INSERT
    );

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

  it("converts a booking request atomically when booking_request_id is provided", async () => {
    appendPostInsertSyncMocks(
      mockClientQuery
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ status: "quoted" }] }) // SELECT job status
        .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // SELECT active visits
        .mockResolvedValueOnce({ rows: [{ id: WORK_ORDER_ID }] }) // resolve work order
        .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }) // INSERT visit
        .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }), // UPDATE booking request
    );

    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, {
        scheduled_start: NOW,
        scheduled_end: NOW,
        booking_request_id: BOOKING_REQUEST_ID,
      })
    );

    expect(res.status).toBe(201);
    expect(mockClientQuery.mock.calls.some((call) =>
      String(call[0]).includes("UPDATE booking_requests")
    )).toBe(true);
    expect(mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE booking_requests")
    )?.[1]).toEqual([
      BOOKING_REQUEST_ID,
      mockSession.accountId,
      mockSession.userId,
      JOB_ID,
      VISIT_ID,
    ]);
  });

  it("returns 422 when booking_request_id does not match the job", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ status: "quoted" }] }) // SELECT job status
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // SELECT active visits
      .mockResolvedValueOnce({ rows: [{ id: WORK_ORDER_ID }] }) // resolve work order
      .mockResolvedValueOnce({ rows: [SAMPLE_VISIT] }) // INSERT visit
      .mockResolvedValueOnce({ rows: [] }) // UPDATE booking request missing
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, {
        scheduled_start: NOW,
        scheduled_end: NOW,
        booking_request_id: BOOKING_REQUEST_ID,
      })
    );

    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("PRECONDITION_FAILED");
  });

  it("returns 422 when the job is no longer schedulable", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ status: "completed" }] }) // SELECT job status
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // SELECT active visits
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, {
        scheduled_start: NOW,
        scheduled_end: NOW,
      })
    );

    expect(res.status).toBe(422);
    await expect(res.json()).resolves.toEqual({ error: "JOB_NOT_SCHEDULABLE" });
    expect(mockClientQuery.mock.calls.some((call) =>
      String(call[0]).includes("INSERT INTO visits")
    )).toBe(false);
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

  it("returns 201 for operational realtor_baseline without work_order_id", async () => {
    const opVisit = { ...SAMPLE_VISIT, visit_type: "realtor_baseline", work_order_id: null };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ status: "quoted" }] }) // SELECT job status
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // SELECT active visits
      .mockResolvedValueOnce({ rows: [opVisit] }) // INSERT (no WO resolve/sync)
      .mockResolvedValueOnce({ rows: [] }) // job status advance
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, {
        scheduled_start: NOW,
        scheduled_end: NOW,
        visit_type: "realtor_baseline",
      }),
    );
    expect(res.status).toBe(201);
    const insertCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("INSERT INTO visits"),
    );
    expect(insertCall?.[1]?.[2] ?? null).toBeNull(); // work_order_id param
    expect(
      mockClientQuery.mock.calls.some((call) =>
        String(call[0]).includes("FROM work_orders"),
      ),
    ).toBe(false);
  });

  it("returns 422 when no work order exists for a standard visit", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [{ status: "quoted" }] }) // SELECT job status
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // SELECT active visits
      .mockResolvedValueOnce({ rows: [] }) // resolve work order — none found
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitCreate(
      makeRequest("POST", `${JOBS_BASE}/${JOB_ID}/visits`, {
        scheduled_start: NOW,
        scheduled_end: NOW,
        visit_type: "standard",
      }),
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("PRECONDITION_FAILED");
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

  });

  it("can mark a reporting membership visit summary as sent → 200", async () => {
    const membershipVisit = {
      ...SAMPLE_VISIT,
      generated_from_plan_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      membership_visit_phase: "reporting",
      membership_snapshot_sent_at: null,
    };
    const updated = { ...membershipVisit, membership_snapshot_sent_at: NOW };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // SET LOCAL
      .mockResolvedValueOnce({ rows: [membershipVisit] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await visitPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}`, { membership_snapshot_sent: true })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.membership_snapshot_sent_at).toBe(NOW);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining("membership_snapshot_sent_at = COALESCE(membership_snapshot_sent_at, now())"),
      expect.any(Array)
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/v1/visits/[id]/transition — status transitions
// ---------------------------------------------------------------------------
describe("POST /api/v1/visits/[id]/transition", () => {
  it("scheduled → arrived with assigned tech → 200 (auto-advances to in_progress)", async () => {
    // The API does two updates: scheduled→arrived then arrived→in_progress
    const updatedInProgress = { ...SAMPLE_VISIT, status: "in_progress", arrived_at: NOW };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "scheduled", assigned_user_id: USER_ID }] }) // SELECT FOR UPDATE
      .mockResolvedValueOnce({ rows: [] }) // UPDATE 1: scheduled → arrived (no RETURNING)
      .mockResolvedValueOnce({ rows: [updatedInProgress] }); // UPDATE 2: arrived → in_progress RETURNING

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "arrived" })
	    );
	    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("in_progress");
    // Time truth: starting the visit opens a job_work activity entry on the visit
    // (the legacy visit_time_logs writer was removed in TASK-064).
    expect(mockClientQuery.mock.calls.some((call) =>
      String(call[0]).includes("INSERT INTO activity_entries") &&
      String(call[0]).includes("'job_work'")
    )).toBe(true);
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
    // Time truth: starting the visit opens a job_work activity entry on the visit
    // (the legacy visit_time_logs writer was removed in TASK-064).
    expect(mockClientQuery.mock.calls.some((call) =>
      String(call[0]).includes("INSERT INTO activity_entries") &&
      String(call[0]).includes("'job_work'")
    )).toBe(true);
  });

  it("in_progress → completed → 200", async () => {
    const updated = { ...SAMPLE_VISIT, status: "completed", completed_at: NOW };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "in_progress" }] })
      .mockResolvedValueOnce({ rows: [{ photo_urls: ["https://example.com/photo.jpg"], signature_url: "https://example.com/sig.png", signature_waiver: false }] })
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
    // Time truth: completing the visit closes its job_work activity segment
    // (the legacy visit_time_logs close was removed in TASK-064).
    const closeActivityCall = mockClientQuery.mock.calls.find((call) =>
      String(call[0]).includes("UPDATE activity_entries") &&
      String(call[0]).includes("entity_type = 'visit' AND entity_id = $2")
    );
    expect(closeActivityCall).toBeTruthy();
    expect(closeActivityCall?.[1]).toEqual([mockSession.accountId, VISIT_ID]);
  });

  it("in_progress → completed without a completion packet → 422 MISSING_PHOTO", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "in_progress" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "completed" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("MISSING_PHOTO");
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

  it("owner scheduled → arrived without assigned_user_id assigns actor and starts visit", async () => {
    const updatedInProgress = { ...SAMPLE_VISIT, status: "in_progress", assigned_user_id: USER_ID, arrived_at: NOW };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...SAMPLE_VISIT, status: "scheduled", assigned_user_id: null }] })
      .mockResolvedValueOnce({ rows: [] }) // owner assignment
      .mockResolvedValueOnce({ rows: [] }) // scheduled → arrived
      .mockResolvedValueOnce({ rows: [updatedInProgress] }); // arrived → in_progress

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "arrived" })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("in_progress");
    expect(mockClientQuery.mock.calls.some((call) =>
      String(call[0]).includes("SET assigned_user_id = $1")
    )).toBe(true);
  });

  it("membership completion without a sent summary → 422 PRECONDITION_FAILED", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            ...SAMPLE_VISIT,
            status: "in_progress",
            generated_from_plan_id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
            membership_visit_phase: "reporting",
            membership_snapshot_sent_at: null,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const res = await visitTransition(
      makeRequest("POST", `${VISITS_BASE}/${VISIT_ID}/transition`, { status: "completed" })
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("PRECONDITION_FAILED");
    expect(json.error.message).toContain("visit summary");
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

// ---------------------------------------------------------------------------
// GET /api/v1/visits/[id]/checklist
// ---------------------------------------------------------------------------
describe("GET /api/v1/visits/[id]/checklist", () => {
  const CHECKLIST_ITEM = {
    id: "item-1",
    item_key: "ext_roof_condition",
    section: "Exterior",
    label: "Roof condition (visible)",
    disposition: null,
    note: null,
    sort_order: 0,
    account_id: mockSession.accountId,
    visit_id: VISIT_ID,
    created_at: NOW,
    updated_at: NOW,
  };

  function withChecklistContextMocks() {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config user
      .mockResolvedValueOnce({ rows: [] }) // set_config account
      .mockResolvedValueOnce({ rows: [] }); // set_config role
  }

  it("returns 200 with seeded items on first access", async () => {
    withChecklistContextMocks();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: VISIT_ID, assigned_user_id: null }] }) // visit SELECT
      .mockResolvedValueOnce({ rows: [{ count: "0" }] }) // COUNT
      .mockResolvedValueOnce({ rows: [] }) // INSERT seed
      .mockResolvedValueOnce({ rows: [CHECKLIST_ITEM] }) // SELECT items
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistGet(makeRequest("GET", `${VISITS_BASE}/${VISIT_ID}/checklist`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
  });

  it("returns 200 with existing items when already seeded", async () => {
    withChecklistContextMocks();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: VISIT_ID, assigned_user_id: null }] })
      .mockResolvedValueOnce({ rows: [{ count: "28" }] }) // COUNT → already seeded
      .mockResolvedValueOnce({ rows: [CHECKLIST_ITEM] }) // SELECT items
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistGet(makeRequest("GET", `${VISITS_BASE}/${VISIT_ID}/checklist`));
    expect(res.status).toBe(200);
  });

  it("returns 404 when visit not found", async () => {
    withChecklistContextMocks();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // visit SELECT → not found
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistGet(makeRequest("GET", `${VISITS_BASE}/${VISIT_ID}/checklist`));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for tech accessing unassigned visit", async () => {
    Object.assign(mockSession, { role: "tech" });
    withChecklistContextMocks();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: VISIT_ID, assigned_user_id: "other-user" }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistGet(makeRequest("GET", `${VISITS_BASE}/${VISIT_ID}/checklist`));
    expect(res.status).toBe(404);

    Object.assign(mockSession, { role: "owner" });
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/visits/[id]/checklist/[itemId]
// ---------------------------------------------------------------------------
describe("PATCH /api/v1/visits/[id]/checklist/[itemId]", () => {
  const ITEM_ID = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

  function withChecklistContextMocks() {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // set_config user
      .mockResolvedValueOnce({ rows: [] }) // set_config account
      .mockResolvedValueOnce({ rows: [] }); // set_config role
  }

  it("returns 200 with updated item on valid body", async () => {
    withChecklistContextMocks();
    const updated = { id: ITEM_ID, disposition: "ok", note: null };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: VISIT_ID, assigned_user_id: null }] }) // visit SELECT
      .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}/checklist/${ITEM_ID}`, {
        disposition: "ok",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.disposition).toBe("ok");
  });

  it("returns 422 when body has neither disposition nor note", async () => {
    const res = await checklistPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}/checklist/${ITEM_ID}`, {})
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 422 when disposition value is invalid", async () => {
    const res = await checklistPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}/checklist/${ITEM_ID}`, {
        disposition: "excellent",
      })
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when visit not found", async () => {
    withChecklistContextMocks();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [] }) // visit SELECT → not found
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}/checklist/${ITEM_ID}`, {
        disposition: "ok",
      })
    );
    expect(res.status).toBe(404);
  });

  it("returns 403 for tech accessing unassigned visit", async () => {
    Object.assign(mockSession, { role: "tech" });
    withChecklistContextMocks();
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: VISIT_ID, assigned_user_id: "different-user" }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}/checklist/${ITEM_ID}`, {
        disposition: "ok",
      })
    );
    expect(res.status).toBe(403);

    Object.assign(mockSession, { role: "owner" });
  });

  it("accepts note-only patch", async () => {
    withChecklistContextMocks();
    const updated = { id: ITEM_ID, disposition: null, note: "needs attention" };
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ id: VISIT_ID, assigned_user_id: null }] })
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const res = await checklistPatch(
      makeRequest("PATCH", `${VISITS_BASE}/${VISIT_ID}/checklist/${ITEM_ID}`, {
        note: "needs attention",
      })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.note).toBe("needs attention");
  });
});
