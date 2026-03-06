/**
 * Integration tests for the visit checklist API.
 *
 * Tier: HTTP integration (Tier 3)
 * Skip condition: TEST_DATABASE_URL or TEST_BASE_URL absent
 *
 * Requires:
 *   - TEST_DATABASE_URL: PostgreSQL instance with migrations applied
 *   - TEST_BASE_URL:     running Next.js dev/preview server
 *
 * To run locally:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3000 pnpm test
 *
 * See docs/TEST_MATRIX.md for the full tier breakdown and CI skip rationale.
 */

import { describe, it, expect, beforeAll } from "vitest";

const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("Visit Checklist API integration", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

  let ownerCookie: string;
  let techCookie: string;
  let testVisitId: string;

  async function apiRequest(
    method: string,
    path: string,
    cookie: string,
    body?: unknown
  ) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  beforeAll(async () => {
    // Authenticate owner
    const ownerLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@test.com", password: "test1234" }),
    });
    ownerCookie = ownerLogin.headers.get("set-cookie") ?? "";

    // Authenticate tech
    const techLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tech@test.com", password: "test1234" }),
    });
    techCookie = techLogin.headers.get("set-cookie") ?? "";

    // Create a client → job → visit fixture to test against
    const clientRes = await apiRequest("POST", "/api/v1/clients", ownerCookie, {
      name: "Checklist Test Client",
    });
    const clientId = clientRes.data.data?.id;

    const jobRes = await apiRequest("POST", "/api/v1/jobs", ownerCookie, {
      client_id: clientId,
      title: "Checklist Integration Test Job",
      status: "scheduled",
    });
    const jobId = jobRes.data.data?.id;

    const visitRes = await apiRequest(
      "POST",
      `/api/v1/jobs/${jobId}/visits`,
      ownerCookie,
      {
        scheduled_start: new Date(Date.now() + 86_400_000).toISOString(),
        scheduled_end: new Date(Date.now() + 86_400_000 + 7200_000).toISOString(),
      }
    );
    testVisitId = visitRes.data.data?.id;
  });

  // -------------------------------------------------------------------------
  // GET — seed on first access
  // -------------------------------------------------------------------------

  it("GET checklist returns 200 and seeds 28 items on first access", async () => {
    const { status, data } = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    expect(status).toBe(200);
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data).toHaveLength(28);
  });

  it("GET checklist is idempotent (second call still returns 28 items)", async () => {
    const { status, data } = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    expect(status).toBe(200);
    expect(data.data).toHaveLength(28);
  });

  it("items include section, item_key, label, disposition=null", async () => {
    const { data } = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    const item = data.data[0];
    expect(item.section).toBeTruthy();
    expect(item.item_key).toBeTruthy();
    expect(item.label).toBeTruthy();
    expect(item.disposition).toBeNull();
  });

  // -------------------------------------------------------------------------
  // PATCH — update items
  // -------------------------------------------------------------------------

  it("PATCH updates disposition to 'ok'", async () => {
    const listRes = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    const itemId = listRes.data.data[0].id;

    const { status, data } = await apiRequest(
      "PATCH",
      `/api/v1/visits/${testVisitId}/checklist/${itemId}`,
      ownerCookie,
      { disposition: "ok" }
    );
    expect(status).toBe(200);
    expect(data.data.disposition).toBe("ok");
  });

  it("PATCH updates note text", async () => {
    const listRes = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    const itemId = listRes.data.data[1].id;

    const { status, data } = await apiRequest(
      "PATCH",
      `/api/v1/visits/${testVisitId}/checklist/${itemId}`,
      ownerCookie,
      { note: "some cracks visible" }
    );
    expect(status).toBe(200);
    expect(data.data.note).toBe("some cracks visible");
  });

  it("PATCH returns 422 when body is empty", async () => {
    const listRes = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    const itemId = listRes.data.data[0].id;

    const { status, data } = await apiRequest(
      "PATCH",
      `/api/v1/visits/${testVisitId}/checklist/${itemId}`,
      ownerCookie,
      {}
    );
    expect(status).toBe(422);
    expect(data.error.code).toBe("VALIDATION_ERROR");
  });

  it("PATCH returns 422 for invalid disposition value", async () => {
    const listRes = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    const itemId = listRes.data.data[0].id;

    const { status } = await apiRequest(
      "PATCH",
      `/api/v1/visits/${testVisitId}/checklist/${itemId}`,
      ownerCookie,
      { disposition: "perfect" }
    );
    expect(status).toBe(422);
  });

  // -------------------------------------------------------------------------
  // Auth / access control
  // -------------------------------------------------------------------------

  it("GET returns 401 when unauthenticated", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/visits/${testVisitId}/checklist`,
      { method: "GET" }
    );
    expect(res.status).toBe(401);
  });

  it("PATCH returns 401 when unauthenticated", async () => {
    const listRes = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      ownerCookie
    );
    const itemId = listRes.data.data[0].id;

    const res = await fetch(
      `${BASE_URL}/api/v1/visits/${testVisitId}/checklist/${itemId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disposition: "ok" }),
      }
    );
    expect(res.status).toBe(401);
  });

  it("GET returns 404 for tech accessing a visit not assigned to them", async () => {
    // testVisitId has no assigned_user_id; tech should be blocked
    const { status } = await apiRequest(
      "GET",
      `/api/v1/visits/${testVisitId}/checklist`,
      techCookie
    );
    expect(status).toBe(404);
  });

  it("GET returns 404 for unknown visit id", async () => {
    const fakeId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const { status } = await apiRequest(
      "GET",
      `/api/v1/visits/${fakeId}/checklist`,
      ownerCookie
    );
    expect(status).toBe(404);
  });
});
