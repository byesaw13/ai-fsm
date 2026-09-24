/**
 * Integration tests for Estimate→Invoice conversion and Invoice API.
 *
 * Tier: HTTP integration (Tier 3)
 * Skip condition: TEST_DATABASE_URL or TEST_BASE_URL absent
 *
 * Requires:
 *   - TEST_DATABASE_URL: PostgreSQL instance with migrations + seed applied
 *   - TEST_BASE_URL: running Next.js server (e.g. http://localhost:3000)
 *
 * To run locally:
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3000 pnpm test
 *
 * See docs/TEST_MATRIX.md for the full tier breakdown and CI skip rationale.
 *
 * Source evidence:
 *   AI-FSM: docs/contracts/api-contract.md (endpoint contracts)
 *   AI-FSM: apps/web/lib/estimates/__tests__/estimates.integration.test.ts (pattern)
 */

import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

// HTTP integration: requires both a running DB and a running web server.
const RUN_INTEGRATION =
  !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN_INTEGRATION)("Invoice conversion API integration", () => {
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

  async function dbExec(sql: string, params: unknown[] = []) {
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(sql, params);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    // Authenticate admin
    const loginRes = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-invoices-__tests__-invoices-integration-test-ts" },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    const setCookie = loginRes.headers.get("set-cookie");
    adminCookie = setCookie?.split(";")[0] ?? "";

    // Authenticate tech
    const techLogin = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-invoices-__tests__-invoices-integration-test-ts" },
      body: JSON.stringify({ email: "tech@test.com", password: "password" }),
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
              unit_price_cents: 20000,
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
              unit_price_cents: 10000,
            },
          ],
        }
      );
      approvedEstimateId = createApprovedRes.data?.id;

      if (approvedEstimateId) {
        await dbExec("UPDATE estimates SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1", [approvedEstimateId]);
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
        const lineItems = data.data?.line_items;
        expect(lineItems).toBeDefined();
        expect(Array.isArray(lineItems)).toBe(true);
        // Line items should have estimate_line_item_id set (traceability)
        if (lineItems.length > 0) {
          expect(lineItems[0].estimate_line_item_id).toBeTruthy();
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

describe.skipIf(!RUN_INTEGRATION)("Sponsored invoice API integration", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const accountClientId = randomUUID();
  const propertyId = randomUUID();
  const beneficiaryId = randomUUID();
  const foreignAccountId = randomUUID();
  const foreignClientId = randomUUID();
  const foreignPropertyId = randomUUID();
  const foreignBeneficiaryId = randomUUID();
  const createdInvoiceIds: string[] = [];
  let adminCookie = "";
  let payerId = "";
  let accountId = "";

  async function apiRequest(method: string, path: string, body?: unknown) {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: await response.json().catch(() => ({})) };
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `it-sponsored-${randomUUID()}` },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const clients = await apiRequest("GET", "/api/v1/clients");
    payerId = clients.data.data[0].id;

    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      accountId = (await db.query<{ account_id: string }>(`SELECT account_id FROM clients WHERE id = $1`, [payerId])).rows[0].account_id;
      await db.query(`INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'Sponsored beneficiary client')`, [accountClientId, accountId]);
      await db.query(`INSERT INTO properties (id, account_id, client_id, address) VALUES ($1, $2, $3, '469 Cilley Road')`, [propertyId, accountId, accountClientId]);
      await db.query(
        `INSERT INTO property_contacts (id, account_id, property_id, external_name, role)
         VALUES ($1, $2, $3, 'Emma', 'beneficiary')`,
        [beneficiaryId, accountId, propertyId],
      );
      await db.query(`INSERT INTO accounts (id, name) VALUES ($1, 'Foreign sponsored test')`, [foreignAccountId]);
      await db.query(`INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'Foreign client')`, [foreignClientId, foreignAccountId]);
      await db.query(`INSERT INTO properties (id, account_id, client_id, address) VALUES ($1, $2, $3, '1 Foreign Way')`, [foreignPropertyId, foreignAccountId, foreignClientId]);
      await db.query(
        `INSERT INTO property_contacts (id, account_id, property_id, external_name, role)
         VALUES ($1, $2, $3, 'Foreign beneficiary', 'beneficiary')`,
        [foreignBeneficiaryId, foreignAccountId, foreignPropertyId],
      );
    } finally {
      await db.end();
    }
  });

  afterAll(async () => {
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      if (createdInvoiceIds.length) {
        await db.query(`DELETE FROM invoice_line_items WHERE invoice_id = ANY($1::uuid[])`, [createdInvoiceIds]);
        await db.query(`DELETE FROM invoices WHERE id = ANY($1::uuid[])`, [createdInvoiceIds]);
      }
      await db.query(`DELETE FROM property_contacts WHERE id = ANY($1::uuid[])`, [[beneficiaryId, foreignBeneficiaryId]]);
      await db.query(`DELETE FROM properties WHERE id = ANY($1::uuid[])`, [[propertyId, foreignPropertyId]]);
      await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[accountClientId, foreignClientId]]);
      await db.query(`DELETE FROM accounts WHERE id = $1`, [foreignAccountId]);
    } finally {
      await db.end();
    }
  });

  const lineItems = [{ description: "Paint touch-ups", quantity: 1, unit_price_cents: 25000, sort_order: 0 }];

  it("rejects another client's property for standard work", async () => {
    const result = await apiRequest("POST", "/api/v1/invoices", {
      client_id: payerId,
      property_id: propertyId,
      tax_rate: 0,
      line_items: lineItems,
    });
    expect(result.status).toBe(422);
  });

  it("renders the sponsored billing controls", async () => {
    const page = await fetch(`${BASE_URL}/app/invoices/new`, { headers: { Cookie: adminCookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Billing context");
    expect(html).toContain("Realtor-sponsored property work");
  }, 30_000);

  it("creates sponsored work for a beneficiary on the selected property", async () => {
    const result = await apiRequest("POST", "/api/v1/invoices", {
      client_id: payerId,
      property_id: propertyId,
      billing_context: "realtor_sponsored",
      sponsored_purpose: "pre_listing",
      beneficiary_property_contact_id: beneficiaryId,
      business_purpose: "Prepare the client's home for listing",
      tax_rate: 0,
      line_items: lineItems,
    });
    expect(result.status).toBe(201);
    createdInvoiceIds.push(result.data.id);

    const updated = await apiRequest("PATCH", `/api/v1/invoices/${result.data.id}`, {
      property_id: propertyId,
      billing_context: "realtor_sponsored",
      sponsored_purpose: "staging_appearance",
      beneficiary_property_contact_id: beneficiaryId,
      business_purpose: "Prepare for listing photos",
    });
    expect(updated.status).toBe(200);
    const loaded = await apiRequest("GET", `/api/v1/invoices/${result.data.id}`);
    expect(loaded.data.data).toMatchObject({
      billing_context: "realtor_sponsored",
      sponsored_purpose: "staging_appearance",
      beneficiary_property_contact_id: beneficiaryId,
      business_purpose: "Prepare for listing photos",
    });
    const detail = await fetch(`${BASE_URL}/app/invoices/${result.data.id}`, { headers: { Cookie: adminCookie } });
    expect(detail.status).toBe(200);
    expect(await detail.text()).toContain("Prepare for listing photos");
  }, 30_000);

  it("rejects property and beneficiary UUIDs from another account", async () => {
    const result = await apiRequest("POST", "/api/v1/invoices", {
      client_id: payerId,
      property_id: foreignPropertyId,
      billing_context: "realtor_sponsored",
      sponsored_purpose: "pre_listing",
      beneficiary_property_contact_id: foreignBeneficiaryId,
      tax_rate: 0,
      line_items: lineItems,
    });
    expect([404, 422]).toContain(result.status);
  });
});
