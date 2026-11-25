/**
 * Integration tests for the month-end CSV export (the period close itself was
 * removed in TASK-258; the export stays, linked from the Reports page).
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
 *   AI-FSM: apps/web/app/api/v1/reports/month-end-export/route.ts
 */

import { describe, it, expect, beforeAll } from "vitest";

const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("Month-end CSV export integration", () => {
  let adminCookie: string;
  let techCookie: string;

  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

  beforeAll(async () => {
    const [adminRes, techRes] = await Promise.all([
      fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "it-reports-__tests__-month-end-export-integration-test-ts" },
        body: JSON.stringify({ email: "admin@test.com", password: "password" }),
      }),
      fetch(`${BASE_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "it-reports-__tests__-month-end-export-integration-test-ts" },
        body: JSON.stringify({ email: "tech@test.com", password: "password" }),
      }),
    ]);
    adminCookie = (adminRes.headers.get("set-cookie") ?? "").split(";")[0];
    techCookie = (techRes.headers.get("set-cookie") ?? "").split(";")[0];
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
