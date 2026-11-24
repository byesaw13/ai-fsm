/**
 * Integration: every door that adds a customer finds the existing one by phone
 * (any format) or email (any case) (TASK-249).
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client, type PoolClient } from "pg";
import { findClientByContact, phoneDigits } from "../match";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";

describe("phoneDigits", () => {
  it("reads a US number however it was typed", () => {
    expect(phoneDigits("(603) 555-0100")).toBe("6035550100");
    expect(phoneDigits("+1 603.555.0100")).toBe("6035550100");
    expect(phoneDigits("555-0100")).toBeNull();
    expect(phoneDigits(null)).toBeNull();
  });
});

describe.skipIf(!RUN)("findClientByContact (TASK-249)", () => {
  let client: Client;
  let db: PoolClient;
  let id: string;
  const phone = `(603) 55${Math.floor(Math.random() * 10)}-${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`;
  const email = `match-${Date.now()}@Example.test`;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    db = client as unknown as PoolClient;
    await client.query(`SELECT set_config('app.current_account_id',$1,false), set_config('app.current_role','owner',false)`, [SEED_ACCOUNT]);
    id = (await client.query(
      `INSERT INTO clients (account_id, name, phone, email) VALUES ($1,'Match Test',$2,$3) RETURNING id`,
      [SEED_ACCOUNT, phone, email],
    )).rows[0].id;
  });

  afterAll(async () => {
    await client.query(`DELETE FROM clients WHERE id = $1`, [id]);
    await client.end();
  });

  it("finds the customer by phone in another format", async () => {
    const e164 = "+1" + phone.replace(/\D/g, "");
    expect(await findClientByContact(db, SEED_ACCOUNT, { phone: e164 })).toBe(id);
  });

  it("finds the customer by email in another case", async () => {
    expect(await findClientByContact(db, SEED_ACCOUNT, { email: email.toUpperCase() })).toBe(id);
  });

  it("returns null for someone new", async () => {
    expect(await findClientByContact(db, SEED_ACCOUNT, { phone: "(999) 000-0000", email: "nobody@example.test" })).toBeNull();
  });
});
