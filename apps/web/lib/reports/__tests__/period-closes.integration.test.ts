/**
 * Integration tests for the Period Closes API.
 *
 * Tier: HTTP integration (Tier 3)
 * Skip condition: TEST_DATABASE_URL or TEST_BASE_URL absent
 *
 * Requires:
 *   - TEST_DATABASE_URL: PostgreSQL instance with migrations (001–008) + seed applied
 *   - TEST_BASE_URL: running Next.js server (e.g. http://localhost:3000)
 *
 * To run locally:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3000 pnpm test
 *
 * See docs/TEST_MATRIX.md for the full tier breakdown and CI skip rationale.
 *
 * Source evidence:
 *   AI-FSM: apps/web/lib/reports/__tests__/profitability.integration.test.ts (pattern)
 *   AI-FSM: apps/web/app/api/v1/reports/period-closes/route.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("Period Closes API integration", () => {
  let adminCookie: string;
  let ownerCookie: string;
  let techCookie: string;

  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const TEST_MONTH = "2099-01"; // far future to avoid colliding with seed data

  async function apiRequest(
    method: string,
    path: string,
    cookie: string,
    body?: unknown
  ) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const isJson = res.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await res.json().catch(() => ({})) : {};
    return { status: res.status, data };
  }

  beforeAll(async () => {
    const [ownerRes, adminRes, techRes] = await Promise.all([
      fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "owner@test.com", password: "test1234" }),
      }),
      fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@test.com", password: "test1234" }),
      }),
      fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "tech@test.com", password: "test1234" }),
      }),
    ]);
    ownerCookie = (ownerRes.headers.get("set-cookie") ?? "").split(";")[0];
    adminCookie = (adminRes.headers.get("set-cookie") ?? "").split(";")[0];
    techCookie = (techRes.headers.get("set-cookie") ?? "").split(";")[0];
  });

  afterAll(async () => {
    // Clean up: remove the test close record if it exists
    await apiRequest("DELETE", `/api/v1/reports/period-closes?month=${TEST_MONTH}`, ownerCookie);
  });

  // ===
  // GET — check status of an open month
  // ===

  it("returns { closed: false } for an open month", async () => {
    const { status, data } = await apiRequest(
      "GET",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      adminCookie
    );
    expect(status).toBe(200);
    expect(data.closed).toBe(false);
    expect(data.close).toBeUndefined();
  });

  it("unauthenticated GET returns 401", async () => {
    const { status } = await apiRequest(
      "GET",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      ""
    );
    expect(status).toBe(401);
  });

  it("GET with invalid month format returns 400", async () => {
    const { status } = await apiRequest(
      "GET",
      "/api/v1/reports/period-closes?month=March-2099",
      adminCookie
    );
    expect(status).toBe(400);
  });

  // ===
  // POST — close a period
  // ===

  it("tech role cannot close a period (403)", async () => {
    const { status } = await apiRequest(
      "POST",
      "/api/v1/reports/period-closes",
      techCookie,
      { month: TEST_MONTH }
    );
    expect(status).toBe(403);
  });

  it("admin can close a period (201)", async () => {
    const { status, data } = await apiRequest(
      "POST",
      "/api/v1/reports/period-closes",
      adminCookie,
      { month: TEST_MONTH, notes: "Integration test close" }
    );
    expect(status).toBe(201);
    expect(data.close.period_month).toBe(TEST_MONTH);
    expect(typeof data.close.closed_by).toBe("string");
    expect(typeof data.close.closed_at).toBe("string");
  });

  it("GET now returns { closed: true } with close record", async () => {
    const { status, data } = await apiRequest(
      "GET",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      adminCookie
    );
    expect(status).toBe(200);
    expect(data.closed).toBe(true);
    expect(data.close.period_month).toBe(TEST_MONTH);
  });

  it("POST same month again returns 409 Conflict", async () => {
    const { status, data } = await apiRequest(
      "POST",
      "/api/v1/reports/period-closes",
      adminCookie,
      { month: TEST_MONTH }
    );
    expect(status).toBe(409);
    expect(data.error.code).toBe("CONFLICT");
  });

  // ===
  // DELETE — reopen a period
  // ===

  it("tech role cannot reopen a period (403)", async () => {
    const { status } = await apiRequest(
      "DELETE",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      techCookie
    );
    expect(status).toBe(403);
  });

  it("admin role cannot reopen a period (403 — owner only)", async () => {
    const { status } = await apiRequest(
      "DELETE",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      adminCookie
    );
    expect(status).toBe(403);
  });

  it("owner can reopen a closed period (204)", async () => {
    const { status } = await apiRequest(
      "DELETE",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      ownerCookie
    );
    expect(status).toBe(204);
  });

  it("GET after reopen returns { closed: false }", async () => {
    const { status, data } = await apiRequest(
      "GET",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      adminCookie
    );
    expect(status).toBe(200);
    expect(data.closed).toBe(false);
  });

  it("DELETE on already-open period returns 404", async () => {
    const { status, data } = await apiRequest(
      "DELETE",
      `/api/v1/reports/period-closes?month=${TEST_MONTH}`,
      ownerCookie
    );
    expect(status).toBe(404);
    expect(data.error.code).toBe("NOT_FOUND");
  });

  // ===
  // Export endpoint smoke tests
  // ===

  it("admin can download expenses CSV for a month", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/reports/month-end-export?month=2026-03&type=expenses`,
      { headers: { Cookie: adminCookie } }
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    // Must have at least a header line
    expect(text).toContain("Date");
    expect(text).toContain("Vendor");
    expect(text).toContain("Amount");
  });

  it("admin can download invoices CSV for a month", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/reports/month-end-export?month=2026-03&type=invoices`,
      { headers: { Cookie: adminCookie } }
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Invoice #");
  });

  it("tech role cannot access month-end-export (403)", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/reports/month-end-export?month=2026-03&type=expenses`,
      { headers: { Cookie: techCookie } }
    );
    expect(res.status).toBe(403);
  });

  it("unauthenticated export request returns 401", async () => {
    const res = await fetch(
      `${BASE_URL}/api/v1/reports/month-end-export?month=2026-03&type=expenses`
    );
    expect(res.status).toBe(401);
  });
});
