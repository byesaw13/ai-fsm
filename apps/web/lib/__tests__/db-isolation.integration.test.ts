import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { compare, hash } from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../env", () => ({
  getEnv: () => ({ DATABASE_URL: process.env.TEST_RUNTIME_DATABASE_URL }),
}));
import { getPool, withDbSession } from "../db";

const enabled = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_RUNTIME_DATABASE_URL;
if (process.env.CI && !enabled) {
  throw new Error("RLS integration requires TEST_DATABASE_URL and TEST_RUNTIME_DATABASE_URL");
}

describe.skipIf(!enabled)("real restricted runtime database isolation", () => {
  const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const accountA = randomUUID();
  const accountB = randomUUID();
  const userA = randomUUID();
  const clientB = randomUUID();
  const email = `rls-${randomUUID()}@test.invalid`;
  const duplicateEmail = `rls-duplicate-${randomUUID()}@test.invalid`;
  const session = { accountId: accountA, userId: userA, role: "owner" as const };

  beforeAll(async () => {
    await admin.query("INSERT INTO accounts (id, name) VALUES ($1, 'RLS A'), ($2, 'RLS B')", [accountA, accountB]);
    const passwordHash = await hash("rls-test-password", 4);
    await admin.query(
      `INSERT INTO users (id, account_id, email, full_name, password_hash, role)
       VALUES ($1, $2, $3, 'RLS owner', $4, 'owner'),
              ($5, $2, $6, 'Duplicate A', $4, 'tech'),
              ($7, $8, $6, 'Duplicate B', $4, 'owner')`,
      [userA, accountA, email, passwordHash, randomUUID(), duplicateEmail, randomUUID(), accountB],
    );
    await admin.query(
      "INSERT INTO clients (id, account_id, name) VALUES ($1, $2, 'Other account client')",
      [clientB, accountB],
    );
  });

  afterAll(async () => {
    await admin.query("DELETE FROM accounts WHERE id = ANY($1::uuid[])", [[accountA, accountB]]);
    await admin.end();
    await getPool().end();
  });

  it("connects as a non-owner, non-superuser role that cannot bypass RLS", async () => {
    const { rows: [role] } = await getPool().query(
      `SELECT current_user AS name, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb,
              (SELECT tableowner FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients') AS owner
       FROM pg_roles WHERE rolname = current_user`,
    );
    expect(role.name).toBe("ai_fsm_web");
    expect(role.owner).not.toBe(role.name);
    expect([role.rolsuper, role.rolbypassrls, role.rolcreaterole, role.rolcreatedb]).toEqual([false, false, false, false]);
    await expect(getPool().query("CREATE TABLE public.runtime_must_not_create (id int)"))
      .rejects.toMatchObject({ code: "42501" });
  });

  it("denies users and client reads without session context, but supports bounded login", async () => {
    expect((await getPool().query("SELECT id FROM users")).rows).toEqual([]);
    expect((await getPool().query("SELECT id FROM clients")).rows).toEqual([]);
    const { rows } = await getPool().query("SELECT * FROM app_login_candidates($1)", [email.toUpperCase()]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(userA);
    expect(await compare("rls-test-password", rows[0].password_hash)).toBe(true);
    expect(await compare("wrong-password", rows[0].password_hash)).toBe(false);
    expect((await getPool().query("SELECT * FROM app_login_candidates($1)", ["missing@test.invalid"])).rows).toEqual([]);
    expect((await getPool().query("SELECT * FROM app_login_candidates($1)", [duplicateEmail])).rows).toHaveLength(2);
  });

  it("reads and writes only its account even when queries omit account filters", async () => {
    await withDbSession(session, async (client) => {
      const own = await client.query("INSERT INTO clients (account_id, name) VALUES ($1, 'Own client') RETURNING id", [accountA]);
      const { rows } = await client.query("SELECT id, account_id FROM clients");
      expect(rows).toEqual([{ id: own.rows[0].id, account_id: accountA }]);
      expect((await client.query("UPDATE clients SET name = 'stolen' WHERE id = $1", [clientB])).rowCount).toBe(0);
      expect((await client.query("DELETE FROM clients WHERE id = $1", [clientB])).rowCount).toBe(0);
      expect((await client.query("SELECT id FROM users WHERE id = $1", [userA])).rows).toEqual([{ id: userA }]);
    });
    await expect(withDbSession(session, (client) =>
      client.query("INSERT INTO clients (account_id, name) VALUES ($1, 'Forbidden')", [accountB]),
    )).rejects.toMatchObject({ code: "42501" });
  });

  it("clears context after commit and failed writes before reusing the pool", async () => {
    await withDbSession(session, async (client) => {
      expect((await client.query("SELECT app_account_id() AS id")).rows[0].id).toBe(accountA);
    });
    expect((await getPool().query("SELECT app_account_id() AS id, app_user_id() AS user_id, app_role() AS role")).rows[0])
      .toEqual({ id: null, user_id: null, role: null });
    await expect(withDbSession({ ...session, role: "tech" }, (client) =>
      client.query("INSERT INTO clients (account_id, name) VALUES ($1, 'Forbidden tech write')", [accountA]),
    )).rejects.toMatchObject({ code: "42501" });
    expect((await getPool().query("SELECT id FROM clients")).rows).toEqual([]);
    await withDbSession({ ...session, accountId: accountB }, async (client) => {
      expect((await client.query("SELECT id FROM clients")).rows).toEqual([{ id: clientB }]);
    });
  });
});
