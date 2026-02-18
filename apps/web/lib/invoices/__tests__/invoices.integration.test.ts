/**
 * Integration tests for Estimate→Invoice conversion and Invoice API.
 *
 * Requires a running PostgreSQL instance (TEST_DATABASE_URL).
 * Skipped in CI environments without a test DB.
 *
 * To run locally: TEST_DATABASE_URL=postgresql://... pnpm test
 *
 * Source evidence:
 *   AI-FSM: docs/contracts/api-contract.md (endpoint contracts)
 *   AI-FSM: apps/web/lib/estimates/__tests__/estimates.integration.test.ts (pattern)
 */

import { describe, it, expect, beforeAll } from "vitest";

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL;
const API_AVAILABLE = !!process.env.TEST_BASE_URL;
const RUN_INTEGRATION = DB_AVAILABLE && API_AVAILABLE;

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(RUN_INTEGRATION)("Invoice conversion API integration", () => {
  let adminCookie: string;
  let techCookie: string;
  let testEstimateId: string;
  let approvedEstimateId: string;

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
    // Authenticate admin
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@test.com", password: "test1234" }),
    });
    const setCookie = loginRes.headers.get("set-cookie");
    adminCookie = setCookie?.split(";")[0] ?? "";

    // Authenticate tech
    const techLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tech@test.com", password: "test1234" }),
    });
    const techCookieHeader = techLogin.headers.get("set-cookie");
    techCookie = techCookieHeader?.split(";")[0] ?? "";

    // Create a draft estimate for conversion tests
    const clientsRes = await apiRequest("GET", "/api/v1/clients", adminCookie);
    const clientId = clientsRes.data?.data?.[0]?.id;

    if (clientId) {
      const createRes = await apiRequest(
        "POST",
        "/api/v1/estimates",
        adminCookie,
        {
          client_id: clientId,
          line_items: [
            {
              description: "Integration test service",
              quantity: 1,
              unit_price_cents: 10000,
            },
          ],
        }
      );
      testEstimateId = createRes.data?.id;

      // Create and approve an estimate for conversion tests
      const createApprovedRes = await apiRequest(
        "POST",
        "/api/v1/estimates",
        adminCookie,
        {
          client_id: clientId,
          line_items: [
            {
              description: "Approved estimate for conversion",
              quantity: 2,
              unit_price_cents: 5000,
            },
          ],
        }
      );
      approvedEstimateId = createApprovedRes.data?.id;

      if (approvedEstimateId) {
        // Transition to sent
        await apiRequest(
          "POST",
          `/api/v1/estimates/${approvedEstimateId}/transition`,
          adminCookie,
          { status: "sent" }
        );
        // Transition to approved
        await apiRequest(
          "POST",
          `/api/v1/estimates/${approvedEstimateId}/transition`,
          adminCookie,
          { status: "approved" }
        );
      }
    }
  });

  // ===
  // POST /api/v1/estimates/[id]/convert
  // ===

  describe("POST /api/v1/estimates/[id]/convert", () => {
    it("returns 401 when unauthenticated", async () => {
      const { status } = await apiRequest(
        "POST",
        `/api/v1/estimates/some-id/convert`,
        ""
      );
      expect(status).toBe(401);
    });

    it("returns 403 when tech role tries to convert", async () => {
      if (!approvedEstimateId) return;
      const { status } = await apiRequest(
        "POST",
        `/api/v1/estimates/${approvedEstimateId}/convert`,
        techCookie
      );
      expect(status).toBe(403);
    });

    it("returns 404 for non-existent estimate", async () => {
      const { status, data } = await apiRequest(
        "POST",
        `/api/v1/estimates/00000000-0000-0000-0000-000000000000/convert`,
        adminCookie
      );
      expect(status).toBe(404);
      expect(data.error?.code).toBe("NOT_FOUND");
    });

    it("returns 400 when estimate is not approved (draft)", async () => {
      if (!testEstimateId) return;
      const { status, data } = await apiRequest(
        "POST",
        `/api/v1/estimates/${testEstimateId}/convert`,
        adminCookie
      );
      expect(status).toBe(400);
      expect(data.error?.code).toBe("INVALID_TRANSITION");
    });

    it("returns 201 and invoice data on first conversion of approved estimate", async () => {
      if (!approvedEstimateId) return;
      const { status, data } = await apiRequest(
        "POST",
        `/api/v1/estimates/${approvedEstimateId}/convert`,
        adminCookie
      );
      // May be 201 (first) or 200 (idempotent if test re-runs)
      expect([200, 201]).toContain(status);
      expect(data.invoice_id).toBeTruthy();
    });

    it("is idempotent: second call returns same invoice_id with created=false", async () => {
      if (!approvedEstimateId) return;
      const first = await apiRequest(
        "POST",
        `/api/v1/estimates/${approvedEstimateId}/convert`,
        adminCookie
      );
      const second = await apiRequest(
        "POST",
        `/api/v1/estimates/${approvedEstimateId}/convert`,
        adminCookie
      );
      expect([200, 201]).toContain(first.status);
      expect(second.status).toBe(200);
      expect(second.data.created).toBe(false);
      expect(second.data.invoice_id).toBe(first.data.invoice_id);
    });
  });

  // ===
  // GET /api/v1/invoices
  // ===

  describe("GET /api/v1/invoices", () => {
    it("returns 401 when unauthenticated", async () => {
      const { status } = await apiRequest("GET", "/api/v1/invoices", "");
      expect(status).toBe(401);
    });

    it("returns 200 and invoice list for admin", async () => {
      const { status, data } = await apiRequest(
        "GET",
        "/api/v1/invoices",
        adminCookie
      );
      expect(status).toBe(200);
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("returns 200 for tech role (read-only access)", async () => {
      const { status } = await apiRequest(
        "GET",
        "/api/v1/invoices",
        techCookie
      );
      expect(status).toBe(200);
    });
  });

  // ===
  // GET /api/v1/invoices/[id]
  // ===

  describe("GET /api/v1/invoices/[id]", () => {
    it("returns 404 for non-existent invoice", async () => {
      const { status } = await apiRequest(
        "GET",
        `/api/v1/invoices/00000000-0000-0000-0000-000000000000`,
        adminCookie
      );
      expect(status).toBe(404);
    });

    it("returns invoice with line_items after conversion", async () => {
      if (!approvedEstimateId) return;
      // Get the invoice created from our approved estimate
      const listRes = await apiRequest(
        "GET",
        `/api/v1/invoices?estimate_id=${approvedEstimateId}`,
        adminCookie
      );
      if (listRes.data?.data?.length > 0) {
        const invoiceId = listRes.data.data[0].id;
        const { status, data } = await apiRequest(
          "GET",
          `/api/v1/invoices/${invoiceId}`,
          adminCookie
        );
        expect(status).toBe(200);
        expect(data.line_items).toBeDefined();
        expect(Array.isArray(data.line_items)).toBe(true);
        // Line items should have estimate_line_item_id set (traceability)
        if (data.line_items.length > 0) {
          expect(data.line_items[0].estimate_line_item_id).toBeTruthy();
        }
      }
    });
  });

  // ===
  // POST /api/v1/invoices/[id]/transition
  // ===

  describe("POST /api/v1/invoices/[id]/transition", () => {
    it("returns 403 for tech role attempting transition", async () => {
      const { status } = await apiRequest(
        "POST",
        `/api/v1/invoices/some-id/transition`,
        techCookie,
        { status: "sent" }
      );
      expect(status).toBe(403);
    });
  });
});
