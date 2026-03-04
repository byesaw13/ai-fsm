/**
 * Integration tests for the Profitability Report API.
 *
 * Tier: HTTP integration (Tier 3)
 * Skip condition: TEST_DATABASE_URL or TEST_BASE_URL absent
 *
 * Requires:
 *   - TEST_DATABASE_URL: PostgreSQL instance with migrations (001–007) + seed applied
 *   - TEST_BASE_URL: running Next.js server (e.g. http://localhost:3000)
 *
 * To run locally:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3000 pnpm test
 *
 * See docs/TEST_MATRIX.md for the full tier breakdown and CI skip rationale.
 *
 * Source evidence:
 *   AI-FSM: apps/web/lib/expenses/__tests__/expenses.integration.test.ts (pattern)
 *   AI-FSM: apps/web/app/api/v1/reports/profitability/route.ts
 */

import { describe, it, expect, beforeAll } from "vitest";

const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("Profitability Report API integration", () => {
  let adminCookie: string;
  let techCookie: string;

  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

  async function apiRequest(method: string, path: string, cookie: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  beforeAll(async () => {
    const adminLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "test1234" }),
    });
    adminCookie = (adminLogin.headers.get("set-cookie") ?? "").split(";")[0];

    const techLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tech@test.com", password: "test1234" }),
    });
    techCookie = (techLogin.headers.get("set-cookie") ?? "").split(";")[0];
  });

  // ===
  // GET /api/v1/reports/profitability
  // ===

  it("admin can access profitability report", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", adminCookie);
    expect(status).toBe(200);
    expect(data.period.month).toBe("2026-03");
    expect(typeof data.revenue).toBe("object");
    expect(typeof data.expenses).toBe("object");
    expect(typeof data.mileage).toBe("object");
    expect(typeof data.net_cents).toBe("number");
    expect(Array.isArray(data.job_profitability)).toBe(true);
  });

  it("returns revenue breakdown by status", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data.revenue.by_status)).toBe(true);
    expect(typeof data.revenue.total_cents).toBe("number");
    expect(typeof data.revenue.paid_cents).toBe("number");
    expect(typeof data.revenue.outstanding_cents).toBe("number");
  });

  it("returns expenses breakdown by category", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", adminCookie);
    expect(status).toBe(200);
    expect(Array.isArray(data.expenses.by_category)).toBe(true);
    expect(typeof data.expenses.total_cents).toBe("number");
  });

  it("returns mileage summary", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", adminCookie);
    expect(status).toBe(200);
    expect(typeof data.mileage.trip_count).toBe("number");
    expect(typeof data.mileage.total_miles).toBe("number");
  });

  it("defaults to current month when month param is absent", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability", adminCookie);
    expect(status).toBe(200);
    expect(data.period.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("ignores invalid month format and defaults to current month", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=March+2026", adminCookie);
    expect(status).toBe(200);
    expect(data.period.month).toMatch(/^\d{4}-\d{2}$/);
  });

  it("job_profitability rows have required fields", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", adminCookie);
    expect(status).toBe(200);
    for (const row of data.job_profitability) {
      expect(typeof row.job_id).toBe("string");
      expect(typeof row.job_title).toBe("string");
      expect(typeof row.revenue_cents).toBe("number");
      expect(typeof row.expense_cents).toBe("number");
      expect(typeof row.mileage_miles).toBe("number");
      expect(typeof row.has_revenue_data).toBe("boolean");
      expect(typeof row.has_cost_data).toBe("boolean");
    }
  });

  it("net_cents equals paid_cents minus expenses_total_cents", async () => {
    const { status, data } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", adminCookie);
    expect(status).toBe(200);
    expect(data.net_cents).toBe(data.revenue.paid_cents - data.expenses.total_cents);
  });

  it("tech cannot access profitability report (403)", async () => {
    const { status } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", techCookie);
    expect(status).toBe(403);
  });

  it("unauthenticated request returns 401", async () => {
    const { status } = await apiRequest("GET", "/api/v1/reports/profitability?month=2026-03", "");
    expect(status).toBe(401);
  });
});
