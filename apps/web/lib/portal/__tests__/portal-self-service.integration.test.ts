import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { CLIENT_CAN_RECEIVE_REQUESTED_SMS_SQL } from "@/lib/sms/outbound";

// TASK-161: portal self-service — request service, edit info, email change,
// combined invoice PDF. Every write needs a portal session for that client.
const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("portal self-service", () => {
  let db: Client;
  let accountId = "";
  let ownerId = "";
  const clientId = randomUUID();
  const otherClientId = randomUUID();
  const propertyId = randomUUID();
  const otherPropertyId = randomUUID();
  const invoiceIds = [randomUUID(), randomUUID()];
  const otherInvoiceId = randomUUID();
  let portalToken = "";
  let cookie = "";
  let previewCookie = "";
  const ip = () => ({ "x-forwarded-for": `it-self-${randomUUID()}` });

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    const admin = await db.query<{ id: string; account_id: string }>(
      `SELECT id, account_id FROM users WHERE email = 'admin@test.com'`,
    );
    accountId = admin.rows[0].account_id;
    ownerId = admin.rows[0].id;

    const c = await db.query<{ portal_token: string }>(
      `INSERT INTO clients (id, account_id, name, email, phone, preferred_contact)
       VALUES ($1, $2, 'Self Service Client', $3, '+16035550100', 'email') RETURNING portal_token::text`,
      [clientId, accountId, `self-${clientId}@example.com`],
    );
    portalToken = c.rows[0].portal_token;
    await db.query(`INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'Other Client')`, [otherClientId, accountId]);
    await db.query(
      `INSERT INTO properties (id, account_id, client_id, name, address) VALUES
       ($1, $3, $4, '12 Maple St', '12 Maple St'), ($2, $3, $5, '9 Other Rd', '9 Other Rd')`,
      [propertyId, otherPropertyId, accountId, clientId, otherClientId],
    );
    for (const [i, id] of invoiceIds.entries()) {
      await db.query(
        `INSERT INTO invoices (id, account_id, client_id, property_id, invoice_number, status, total_cents, created_by)
         VALUES ($1, $2, $3, $4, $5, 'sent', 5000, $6)`,
        [id, accountId, clientId, propertyId, `SS-${Date.now()}-${i}`, ownerId],
      );
    }
    await db.query(
      `INSERT INTO invoices (id, account_id, client_id, invoice_number, status, total_cents, created_by)
       VALUES ($1, $2, $3, $4, 'sent', 5000, $5)`,
      [otherInvoiceId, accountId, otherClientId, `SS-${Date.now()}-x`, ownerId],
    );
    const s = await db.query<{ token: string }>(
      `INSERT INTO portal_sessions (client_id, expires_at) VALUES ($1, now() + interval '1 hour') RETURNING token::text`,
      [clientId],
    );
    cookie = `portal_session=${s.rows[0].token}`;
    const p = await db.query<{ token: string }>(
      `INSERT INTO portal_sessions (client_id, expires_at, is_preview) VALUES ($1, now() + interval '1 hour', true) RETURNING token::text`,
      [clientId],
    );
    previewCookie = `portal_session=${p.rows[0].token}`;
  });

  afterAll(async () => {
    if (!db) return;
    const ids = [clientId, otherClientId];
    await db.query(`DELETE FROM attention_events WHERE entity_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM audit_log WHERE entity_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(
      `DELETE FROM attention_events WHERE entity_id IN (SELECT id FROM booking_requests WHERE client_id = ANY($1::uuid[]))`,
      [ids],
    ).catch(() => undefined);
    await db.query(`DELETE FROM booking_requests WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM jobs WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM invoices WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM properties WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM portal_magic_links WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM portal_sessions WHERE client_id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [ids]).catch(() => undefined);
    await db.end();
  });

  const patch = (body: unknown, c = cookie) =>
    fetch(`${BASE_URL}/api/portal/${portalToken}/profile`, {
      method: "PATCH",
      headers: { Cookie: c, "Content-Type": "application/json", ...ip() },
      body: JSON.stringify(body),
    });

  it("profile: needs a session for this client, and preview is read-only", async () => {
    expect((await patch({ phone: "603-555-0199" }, "")).status).toBe(401);
    expect((await patch({ phone: "603-555-0199" }, previewCookie)).status).toBe(403);
  }, 60_000);

  it("profile: phone and preferred contact save, notify the owner, and are audit logged", async () => {
    // "Text me" without consent is refused; ticking the consent box records it.
    expect((await patch({ preferred_contact: "sms" })).status).toBe(400);
    const res = await patch({ phone: "(603) 555-0199", preferred_contact: "sms", sms_consent: true });
    expect(res.status).toBe(200);
    const row = await db.query(
      `SELECT phone, preferred_contact, sms_consent, sms_consent_source FROM clients WHERE id = $1`,
      [clientId],
    );
    expect(row.rows[0]).toEqual({ phone: "+16035550199", preferred_contact: "sms", sms_consent: true, sms_consent_source: "portal" });
    const audit = await db.query(
      `SELECT old_value->>'phone' AS old_phone, new_value->>'phone' AS new_phone FROM audit_log
       WHERE entity_type = 'client' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [clientId],
    );
    expect(audit.rows[0]).toEqual({ old_phone: "+16035550100", new_phone: "+16035550199" });
    const ev = await db.query(
      `SELECT summary FROM attention_events WHERE entity_id = $1 AND type = 'client.profile_updated'`,
      [clientId],
    );
    expect(ev.rows[0].summary).toContain("+16035550199");
    expect((await patch({ phone: "12" })).status).toBe(400);
  }, 60_000);

  it("profile: a new email never applies without verification", async () => {
    const res = await patch({ email: `new-${clientId}@example.com` });
    expect([200, 502]).toContain(res.status); // 502 when SMTP isn't configured
    const row = await db.query(`SELECT email FROM clients WHERE id = $1`, [clientId]);
    expect(row.rows[0].email).toBe(`self-${clientId}@example.com`);
  }, 60_000);

  it("email-change token verifies the email but can never log anyone in", async () => {
    const link = await db.query<{ token: string }>(
      `INSERT INTO portal_magic_links (client_id, expires_at, pending_email)
       VALUES ($1, now() + interval '1 hour', $2) RETURNING token::text`,
      [clientId, `verified-${clientId}@example.com`],
    );
    const token = link.rows[0].token;

    const login = await fetch(`${BASE_URL}/api/v1/portal/auth/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      redirect: "manual",
    });
    expect(login.headers.get("location") ?? "").toContain("error=expired");
    expect(login.headers.get("set-cookie") ?? "").not.toContain("portal_session=");

    // A mail scanner opening the link (GET) changes nothing; it only reaches the confirm page.
    const scanned = await fetch(`${BASE_URL}/api/v1/portal/auth/verify-email?token=${token}`, { redirect: "manual" });
    expect(scanned.headers.get("location") ?? "").toContain("/portal/auth/confirm?kind=email");
    const untouched = await db.query(`SELECT email FROM clients WHERE id = $1`, [clientId]);
    expect(untouched.rows[0].email).toBe(`self-${clientId}@example.com`);

    const confirm = () =>
      fetch(`${BASE_URL}/api/v1/portal/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        redirect: "manual",
      });
    expect((await confirm()).headers.get("location") ?? "").toContain("email=updated");
    const row = await db.query(`SELECT email FROM clients WHERE id = $1`, [clientId]);
    expect(row.rows[0].email).toBe(`verified-${clientId}@example.com`);
    const audit = await db.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE entity_id = $1 AND new_value->>'email' = $2`,
      [clientId, `verified-${clientId}@example.com`],
    );
    expect(audit.rows[0].n).toBe(1);

    expect((await confirm()).headers.get("location") ?? "").toContain("error=expired");
  }, 60_000);

  const request = (body: unknown, c = cookie) =>
    fetch(`${BASE_URL}/api/portal/${portalToken}/request`, {
      method: "POST",
      headers: { Cookie: c, "Content-Type": "application/json", ...ip() },
      body: JSON.stringify(body),
    });
  const ask = { service_category: "general_repairs", service_description: "Two closet doors are off their track." };

  it("request: lands in Requests tied to the client and their property", async () => {
    expect((await request({ ...ask, property_id: propertyId }, "")).status).toBe(401);
    expect((await request({ ...ask, property_id: propertyId }, previewCookie)).status).toBe(403);
    expect((await request({ ...ask, property_id: otherPropertyId })).status).toBe(404);

    const res = await request({ ...ask, property_id: propertyId, access_notes: "Lockbox 4471" });
    expect(res.status).toBe(201);
    const { booking_id } = await res.json();
    const row = await db.query(
      `SELECT client_id::text, property_id::text, address, access_notes FROM booking_requests WHERE id = $1`,
      [booking_id],
    );
    expect(row.rows[0]).toEqual({ client_id: clientId, property_id: propertyId, address: "12 Maple St", access_notes: "Lockbox 4471" });
    const clientRows = await db.query(`SELECT count(*)::int AS n FROM clients WHERE name = 'Self Service Client'`);
    expect(clientRows.rows[0].n).toBe(1);
  }, 60_000);

  it("sign-in by text is never sent to someone who opted out", async () => {
    const cases: [string, unknown[], boolean][] = [
      ["never asked", [false, null, null], true],
      ["consented", [true, "booking_form", new Date()], true],
      ["texted STOP", [false, "sms_stop", new Date()], false],
      ["portal opt-out", [false, "portal_opt_out", new Date()], false],
      ["legacy portal opt-out", [false, null, new Date()], false],
    ];
    for (const [name, [consent, source, at], expected] of cases) {
      const r = await db.query<{ ok: boolean }>(
        `SELECT ${CLIENT_CAN_RECEIVE_REQUESTED_SMS_SQL} AS ok
         FROM (SELECT $1::boolean AS sms_consent, $2::text AS sms_consent_source, $3::timestamptz AS sms_consent_at) c`,
        [consent, source, at],
      );
      expect(r.rows[0].ok, name).toBe(expected);
    }

    const res = await fetch(`${BASE_URL}/api/v1/portal/request-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...ip() },
      body: JSON.stringify({ phone: "603-555-0199" }),
    });
    expect(res.status).toBe(200); // same answer whether or not the number is on file
  }, 60_000);

  const pdf = (ids: string[], c = cookie) =>
    fetch(`${BASE_URL}/api/portal/${portalToken}/invoices-pdf?ids=${ids.join(",")}`, { headers: { Cookie: c, ...ip() } });

  it("combined PDF: only this client's invoices, all or nothing", async () => {
    expect((await pdf(invoiceIds, "")).status).toBe(401);
    expect((await pdf([...invoiceIds, otherInvoiceId])).status).toBe(404);
    expect((await pdf(Array.from({ length: 11 }, () => randomUUID()))).status).toBe(400);

    const res = await pdf(invoiceIds);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");

    expect((await pdf(invoiceIds, previewCookie)).status).toBe(200); // reading is fine in preview
  }, 120_000);
});
