import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("property contact API", () => {
  let adminCookie = "";
  let clientId = "";
  let propertyId = "";
  let ownerlessPropertyId = "";
  let invoiceId = "";

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
      headers: { "Content-Type": "application/json", "x-forwarded-for": `it-properties-${randomUUID()}` },
      body: JSON.stringify({ email: "admin@test.com", password: "password" }),
    });
    adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const clients = await apiRequest("GET", "/api/v1/clients");
    clientId = clients.data.data[0].id;
  });

  afterAll(async () => {
    if (!process.env.TEST_DATABASE_URL) return;
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      if (invoiceId) await db.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);
      if (clientId) await db.query(`UPDATE clients SET primary_property_id = NULL WHERE id = $1`, [clientId]);
      await db.query(`DELETE FROM properties WHERE id = ANY($1::uuid[])`, [
        [propertyId, ownerlessPropertyId].filter(Boolean),
      ]);
    } finally {
      await db.end();
    }
  });

  it("creates and lists a property without a primary service contact", async () => {
    const created = await apiRequest("POST", "/api/v1/properties", {
      client_id: null,
      address: "469 Cilley Road",
      city: "Manchester",
      state: "NH",
    });
    expect(created.status).toBe(201);
    expect(created.data.data.client_id).toBeNull();
    ownerlessPropertyId = created.data.data.id;

    const listed = await apiRequest("GET", "/api/v1/properties?q=469%20Cilley");
    expect(listed.status).toBe(200);
    expect(listed.data.data.some((row: { id: string }) => row.id === ownerlessPropertyId)).toBe(true);

    const detail = await fetch(`${BASE_URL}/app/properties/${ownerlessPropertyId}`, {
      headers: { Cookie: adminCookie },
    });
    expect(detail.status).toBe(200);
    expect(await detail.text()).toContain("No primary contact");
  });

  it("creates, updates, lists, and deletes a property contact", async () => {
    const property = await apiRequest("POST", "/api/v1/properties", {
      client_id: clientId,
      address: "1568 Lake Shore Road",
      city: "Manchester",
      state: "NH",
      zip: "03109",
    });
    expect(property.status).toBe(201);
    propertyId = property.data.data.id;

    const created = await apiRequest("POST", `/api/v1/properties/${propertyId}/contacts`, {
      external_name: "Emma",
      external_email: "emma@example.com",
      role: "beneficiary",
      notes: "Kim's client",
    });
    expect(created.status).toBe(201);

    const updated = await apiRequest(
      "PATCH",
      `/api/v1/properties/${propertyId}/contacts/${created.data.data.id}`,
      { external_name: "Emma T.", role: "beneficiary" },
    );
    expect(updated.status).toBe(200);
    expect(updated.data.data.external_name).toBe("Emma T.");

    const listed = await apiRequest("GET", `/api/v1/properties/${propertyId}/contacts`);
    expect(listed.status).toBe(200);
    expect(listed.data.data).toHaveLength(1);

    const deleted = await apiRequest("DELETE", `/api/v1/properties/${propertyId}/contacts/${created.data.data.id}`);
    expect(deleted.status).toBe(200);
  });

  it("rejects unknown registered contacts and invalid main properties", async () => {
    const missingContact = await apiRequest("POST", `/api/v1/properties/${propertyId}/contacts`, {
      client_id: randomUUID(),
      role: "realtor",
    });
    expect(missingContact.status).toBe(422);

    const invalidMain = await apiRequest("PATCH", `/api/v1/clients/${clientId}`, {
      primary_property_id: ownerlessPropertyId,
    });
    expect(invalidMain.status).toBe(422);

    const validMain = await apiRequest("PATCH", `/api/v1/clients/${clientId}`, {
      primary_property_id: propertyId,
    });
    expect(validMain.status).toBe(200);
    expect(validMain.data.data.primary_property_id).toBe(propertyId);
  });

  it("does not delete a contact used by an invoice", async () => {
    const contact = await apiRequest("POST", `/api/v1/properties/${propertyId}/contacts`, {
      external_name: "Protected beneficiary",
      role: "beneficiary",
    });
    expect(contact.status).toBe(201);

    invoiceId = randomUUID();
    const db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    try {
      await db.query(
        `INSERT INTO invoices
           (id, account_id, client_id, property_id, invoice_number, billing_context,
            sponsored_purpose, beneficiary_property_contact_id, created_by)
         SELECT $1, c.account_id, c.id, $2, $3, 'realtor_sponsored', 'other', $4, u.id
         FROM clients c
         JOIN users u ON u.account_id = c.account_id AND u.email = 'admin@test.com'
         WHERE c.id = $5`,
        [invoiceId, propertyId, `PC-${Date.now()}`, contact.data.data.id, clientId],
      );
    } finally {
      await db.end();
    }

    const deleted = await apiRequest("DELETE", `/api/v1/properties/${propertyId}/contacts/${contact.data.data.id}`);
    expect(deleted.status).toBe(409);
    expect(deleted.data.error.code).toBe("CONTACT_IN_USE");
  });
});
