/**
 * Integration tests for the Estimates API.
 *
 * These tests require a running PostgreSQL instance (TEST_DATABASE_URL).
 * They are skipped in CI environments without a test DB.
 *
 * To run locally: TEST_DATABASE_URL=postgresql://... pnpm test
 *
 * Source evidence:
 *   AI-FSM: docs/contracts/api-contract.md (endpoint contracts)
 *   AI-FSM: docs/contracts/workflow-states.md (estimate lifecycle)
 *   Myprogram: supabase/__tests__/integration/rls.test.ts (RLS abuse pattern)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";

// Skip if TEST_DATABASE_URL is not set OR if TEST_BASE_URL is not set
// (these tests make HTTP calls and require a running Next.js server)
const DB_AVAILABLE =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(DB_AVAILABLE)("Estimates API integration", () => {
  // TODO: Set up test DB helpers (seed account, admin user, tech user)
  // Reference: apps/web/lib/auth/__tests__/auth.integration.test.ts pattern

  let adminCookie: string;
  let techCookie: string;
  let ownerCookie: string;
  let testClientId: string;
  let testEstimateId: string;

  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

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
    // Login as admin, owner, and tech
    // (Relies on seed data from db/migrations/002_seed_dev.sql)
    const adminRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "test1234" }),
    });
    adminCookie = adminRes.headers.get("set-cookie") ?? "";

    // TODO: Add owner and tech login when seed includes those users
    ownerCookie = adminCookie; // placeholder
    techCookie = adminCookie; // placeholder

    // Create a test client
    const clientRes = await apiRequest("POST", "/api/v1/clients", adminCookie, {
      name: "Test Client for Estimates",
      email: "testclient@example.com",
    });
    testClientId = clientRes.data?.id ?? "";
  });

  afterAll(async () => {
    // Cleanup: delete the test client (cascades to estimates)
    if (testClientId) {
      await apiRequest("DELETE", `/api/v1/clients/${testClientId}`, ownerCookie);
    }
  });

  describe("POST /api/v1/estimates", () => {
    it("creates a draft estimate and returns id", async () => {
      const { status, data } = await apiRequest(
        "POST",
        "/api/v1/estimates",
        adminCookie,
        {
          client_id: testClientId,
          line_items: [
            {
              description: "Service A",
              quantity: 2,
              unit_price_cents: 5000,
              sort_order: 0,
            },
          ],
        }
      );
      expect(status).toBe(201);
      expect(data.id).toBeTruthy();
      testEstimateId = data.id;
    });

    it("returns 403 for tech role", async () => {
      const { status } = await apiRequest(
        "POST",
        "/api/v1/estimates",
        techCookie,
        { client_id: testClientId, line_items: [] }
      );
      expect(status).toBe(403);
    });

    it("returns 400 for missing client_id", async () => {
      const { status, data } = await apiRequest(
        "POST",
        "/api/v1/estimates",
        adminCookie,
        { line_items: [] }
      );
      expect(status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/v1/estimates", () => {
    it("lists estimates with pagination", async () => {
      const { status, data } = await apiRequest(
        "GET",
        "/api/v1/estimates?limit=10&page=1",
        adminCookie
      );
      expect(status).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.pagination).toBeDefined();
    });

    it("filters by status=draft", async () => {
      const { status, data } = await apiRequest(
        "GET",
        "/api/v1/estimates?status=draft",
        adminCookie
      );
      expect(status).toBe(200);
      for (const est of data.data) {
        expect(est.status).toBe("draft");
      }
    });
  });

  describe("GET /api/v1/estimates/[id]", () => {
    it("returns estimate with line items", async () => {
      const { status, data } = await apiRequest(
        "GET",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie
      );
      expect(status).toBe(200);
      expect(data.data.id).toBe(testEstimateId);
      expect(Array.isArray(data.data.line_items)).toBe(true);
      expect(data.data.line_items.length).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent id", async () => {
      const { status, data } = await apiRequest(
        "GET",
        "/api/v1/estimates/00000000-0000-0000-0000-000000000000",
        adminCookie
      );
      expect(status).toBe(404);
      expect(data.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PATCH /api/v1/estimates/[id]", () => {
    it("updates draft fields", async () => {
      const { status, data } = await apiRequest(
        "PATCH",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie,
        { notes: "Updated notes" }
      );
      expect(status).toBe(200);
      expect(data.updated).toBe(true);
    });

    it("updates line items in draft state and recalculates totals", async () => {
      const { status } = await apiRequest(
        "PATCH",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie,
        {
          line_items: [
            { description: "New item", quantity: 1, unit_price_cents: 10000 },
          ],
        }
      );
      expect(status).toBe(200);

      const { data: detail } = await apiRequest(
        "GET",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie
      );
      expect(detail.data.total_cents).toBe(10000);
    });
  });

  describe("POST /api/v1/estimates/[id]/transition", () => {
    it("transitions draft → sent", async () => {
      const { status, data } = await apiRequest(
        "POST",
        `/api/v1/estimates/${testEstimateId}/transition`,
        adminCookie,
        { status: "sent" }
      );
      expect(status).toBe(200);
      expect(data.status).toBe("sent");
    });

    it("rejects invalid transition (sent → draft is not allowed)", async () => {
      const { status, data } = await apiRequest(
        "POST",
        `/api/v1/estimates/${testEstimateId}/transition`,
        adminCookie,
        { status: "draft" }
      );
      expect(status).toBe(400);
      expect(data.error.code).toBe("INVALID_TRANSITION");
    });

    it("PATCH on sent state: only internal_notes accepted", async () => {
      const { status } = await apiRequest(
        "PATCH",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie,
        { internal_notes: "Private update" }
      );
      expect(status).toBe(200);

      // Trying to change notes (not allowed in sent state)
      const { status: s2, data: d2 } = await apiRequest(
        "PATCH",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie,
        { notes: "Attempted change" }
      );
      expect(s2).toBe(422);
      expect(d2.error.code).toBe("IMMUTABLE_ENTITY");
    });

    it("transitions sent → approved", async () => {
      const { status, data } = await apiRequest(
        "POST",
        `/api/v1/estimates/${testEstimateId}/transition`,
        adminCookie,
        { status: "approved" }
      );
      expect(status).toBe(200);
      expect(data.status).toBe("approved");
    });

    it("PATCH on approved state returns 422 IMMUTABLE_ENTITY", async () => {
      const { status, data } = await apiRequest(
        "PATCH",
        `/api/v1/estimates/${testEstimateId}`,
        adminCookie,
        { notes: "Attempted change" }
      );
      expect(status).toBe(422);
      expect(data.error.code).toBe("IMMUTABLE_ENTITY");
    });
  });

  describe("DELETE /api/v1/estimates/[id]", () => {
    it("creates and deletes a draft estimate (owner only)", async () => {
      // Create new estimate to delete
      const { data: created } = await apiRequest(
        "POST",
        "/api/v1/estimates",
        adminCookie,
        {
          client_id: testClientId,
          line_items: [],
        }
      );
      const deleteId = created.id;

      const { status } = await apiRequest(
        "DELETE",
        `/api/v1/estimates/${deleteId}`,
        ownerCookie
      );
      expect(status).toBe(200);
    });

    it("returns 422 when trying to delete non-draft estimate", async () => {
      // testEstimateId is now 'approved' from the transition tests above
      const { status, data } = await apiRequest(
        "DELETE",
        `/api/v1/estimates/${testEstimateId}`,
        ownerCookie
      );
      expect(status).toBe(422);
      expect(data.error.code).toBe("IMMUTABLE_ENTITY");
    });
  });
});
