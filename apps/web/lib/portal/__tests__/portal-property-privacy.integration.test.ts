import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

// Customer property page: a portal token alone never grants access, and staff
// notes (pinned or not) never reach customer HTML.
const RUN = Boolean(process.env.TEST_DATABASE_URL && process.env.TEST_BASE_URL);
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN)("portal property page privacy", () => {
  let db: Client;
  let accountId = "";
  const owner = randomUUID();
  const stranger = randomUUID();
  const propertyId = randomUUID();
  let ownerToken = "";
  let ownerCookie = "";
  let strangerCookie = "";
  const url = () => `${BASE_URL}/portal/${ownerToken}/property/${propertyId}`;
  const get = (cookie?: string) => fetch(url(), { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });

  beforeAll(async () => {
    db = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await db.connect();
    const admin = await db.query<{ account_id: string }>(`SELECT account_id FROM users WHERE email = 'admin@test.com'`);
    accountId = admin.rows[0].account_id;
    await db.query(
      `INSERT INTO clients (id, account_id, name) VALUES ($1, $3, 'Privacy Owner'), ($2, $3, 'Privacy Stranger')`,
      [owner, stranger, accountId],
    );
    ownerToken = (await db.query<{ t: string }>(`SELECT portal_token::text AS t FROM clients WHERE id = $1`, [owner])).rows[0].t;
    await db.query(
      `INSERT INTO properties (id, account_id, client_id, name, address) VALUES ($1, $2, $3, 'Privacy House', '5 Quiet Ln')`,
      [propertyId, accountId, owner],
    );
    await db.query(
      `INSERT INTO property_notes (account_id, property_id, body, pinned) VALUES
       ($1, $2, 'STAFF-PINNED-SECRET gate code 4471', true),
       ($1, $2, 'STAFF-NOTE-SECRET customer is slow to pay', false)`,
      [accountId, propertyId],
    );
    const s = await db.query<{ client_id: string; token: string }>(
      `INSERT INTO portal_sessions (client_id, expires_at) VALUES ($1, now() + interval '1 hour'), ($2, now() + interval '1 hour')
       RETURNING client_id::text, token::text`,
      [owner, stranger],
    );
    for (const row of s.rows) {
      if (row.client_id === owner) ownerCookie = `portal_session=${row.token}`;
      else strangerCookie = `portal_session=${row.token}`;
    }
  });

  afterAll(async () => {
    if (!db) return;
    await db.query(`DELETE FROM portal_sessions WHERE client_id = ANY($1::uuid[])`, [[owner, stranger]]).catch(() => undefined);
    await db.query(`DELETE FROM property_notes WHERE property_id = $1`, [propertyId]).catch(() => undefined);
    await db.query(`DELETE FROM properties WHERE id = $1`, [propertyId]).catch(() => undefined);
    await db.query(`DELETE FROM clients WHERE id = ANY($1::uuid[])`, [[owner, stranger]]).catch(() => undefined);
    await db.end();
  });

  it("the portal link alone redirects to sign-in and reveals nothing", async () => {
    const res = await get();
    expect([302, 303, 307, 308]).toContain(res.status);
    expect(res.headers.get("location") ?? "").toContain("/portal/login");
    expect(await res.text()).not.toContain("5 Quiet Ln");
  }, 60_000);

  it("another customer's session is refused", async () => {
    const res = await get(strangerCookie);
    expect(res.headers.get("location") ?? "").toContain("/portal/login");
  }, 60_000);

  it("the owner sees the property but never staff notes", async () => {
    const res = await get(ownerCookie);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("5 Quiet Ln");
    expect(html).not.toContain("STAFF-PINNED-SECRET");
    expect(html).not.toContain("STAFF-NOTE-SECRET");
  }, 60_000);
});
