/**
 * Integration tests for the Dovetails OS MCP server.
 *
 * These run against a real PostgreSQL instance with migrations + seed applied.
 * Set TEST_DATABASE_URL to enable; the whole suite is skipped when it is unset
 * (so `pnpm test:unit` and local runs without a DB stay green).
 *
 * What is verified end-to-end:
 *   1. withMcpSession sets the app.current_* RLS session variables correctly.
 *   2. Owner and admin operators resolve and can run read-only tools.
 *   3. A tech operator is rejected at startup (resolveSession is the gate).
 *   4. Account scoping: tools run as account A never return account B rows.
 *   5. Read-only enforcement: an INSERT/UPDATE inside the MCP session fails
 *      because the transaction is `transaction_read_only = on`.
 *
 * Seed identities (db/migrations/002_seed_dev.sql):
 *   Account A 1111…1111   owner@test.com / admin@test.com / tech@test.com
 *   Account B 2222…2222   owner-b@test.com
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { resolveSession } from "../session.js";
import { withMcpSession, closePool } from "../db.js";
import type { Session } from "../types.js";
import { run as searchClients } from "../tools/search-clients.js";
import { run as getClientSummary } from "../tools/get-client-summary.js";
import { run as getInvoiceStatus } from "../tools/get-invoice-status.js";
import { run as listUnpaidInvoices } from "../tools/list-unpaid-invoices.js";
import { run as getRecentPayments } from "../tools/get-recent-payments.js";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const shouldRun = !!TEST_DB_URL;

// Seed UUIDs
const ACCOUNT_A = "11111111-1111-1111-1111-111111111111";
const ACCOUNT_B = "22222222-2222-2222-2222-222222222222";
const OWNER_A_ID = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const OWNER_B_ID = "22222222-2222-2222-2222-aaaaaaaaaaaa";

const OWNER_A_EMAIL = "owner@test.com";
const ADMIN_A_EMAIL = "admin@test.com";
const TECH_A_EMAIL = "tech@test.com";
const OWNER_B_EMAIL = "owner-b@test.com";

// Unique markers so this suite never collides with other data.
const CLIENT_A_NAME = "MCP-IT Client A";
const CLIENT_B_NAME = "MCP-IT Client B";
const INVOICE_A_NUMBER = "MCP-IT-A1";
const INVOICE_B_NUMBER = "MCP-IT-B1";

const sessionA: Session = {
  userId: OWNER_A_ID,
  accountId: ACCOUNT_A,
  role: "owner",
  fullName: "Test Owner",
};
const sessionB: Session = {
  userId: OWNER_B_ID,
  accountId: ACCOUNT_B,
  role: "owner",
  fullName: "Other Owner",
};

describe.skipIf(!shouldRun)("MCP server integration", () => {
  // Raw superuser client used only for seeding + cleanup (outside the MCP
  // read-only session, so it bypasses RLS and may write).
  let db: Client;
  let clientAId: string;
  let clientBId: string;
  let invoiceAId: string;
  let invoiceBId: string;
  let paymentAId: string;

  async function cleanup(): Promise<void> {
    await db.query(
      `DELETE FROM payments WHERE invoice_id IN
         (SELECT id FROM invoices WHERE invoice_number IN ($1, $2))`,
      [INVOICE_A_NUMBER, INVOICE_B_NUMBER],
    );
    await db.query(`DELETE FROM invoices WHERE invoice_number IN ($1, $2)`, [
      INVOICE_A_NUMBER,
      INVOICE_B_NUMBER,
    ]);
    await db.query(`DELETE FROM clients WHERE name IN ($1, $2)`, [CLIENT_A_NAME, CLIENT_B_NAME]);
  }

  beforeAll(async () => {
    // Point the MCP pool (resolveSession + withMcpSession) at the test DB.
    process.env.DATABASE_URL = TEST_DB_URL;

    db = new Client({ connectionString: TEST_DB_URL });
    await db.connect();
    await cleanup(); // defensive: clear any residue from a prior failed run

    // --- Account A data ---
    clientAId = (
      await db.query<{ id: string }>(
        `INSERT INTO clients (account_id, name, email) VALUES ($1, $2, 'a@x.com') RETURNING id`,
        [ACCOUNT_A, CLIENT_A_NAME],
      )
    ).rows[0].id;
    invoiceAId = (
      await db.query<{ id: string }>(
        `INSERT INTO invoices (account_id, client_id, status, invoice_number, total_cents, created_by)
         VALUES ($1, $2, 'sent', $3, 100000, $4) RETURNING id`,
        [ACCOUNT_A, clientAId, INVOICE_A_NUMBER, OWNER_A_ID],
      )
    ).rows[0].id;
    // status 'paid' fires sync_invoice_on_payment → invoice A becomes 'partial'
    paymentAId = (
      await db.query<{ id: string }>(
        `INSERT INTO payments (account_id, invoice_id, customer_id, amount_cents, method, status, created_by)
         VALUES ($1, $2, $3, 40000, 'check', 'paid', $4) RETURNING id`,
        [ACCOUNT_A, invoiceAId, clientAId, OWNER_A_ID],
      )
    ).rows[0].id;

    // --- Account B data ---
    clientBId = (
      await db.query<{ id: string }>(
        `INSERT INTO clients (account_id, name, email) VALUES ($1, $2, 'b@x.com') RETURNING id`,
        [ACCOUNT_B, CLIENT_B_NAME],
      )
    ).rows[0].id;
    invoiceBId = (
      await db.query<{ id: string }>(
        `INSERT INTO invoices (account_id, client_id, status, invoice_number, total_cents, created_by)
         VALUES ($1, $2, 'sent', $3, 200000, $4) RETURNING id`,
        [ACCOUNT_B, clientBId, INVOICE_B_NUMBER, OWNER_B_ID],
      )
    ).rows[0].id;
    await db.query(
      `INSERT INTO payments (account_id, invoice_id, customer_id, amount_cents, method, status, created_by)
       VALUES ($1, $2, $3, 50000, 'venmo', 'paid', $4)`,
      [ACCOUNT_B, invoiceBId, clientBId, OWNER_B_ID],
    );
  });

  afterAll(async () => {
    if (db) {
      await cleanup();
      await db.end();
    }
    await closePool();
  });

  // ---------------------------------------------------------------------------
  // 1. RLS session variables
  // ---------------------------------------------------------------------------
  it("sets app.current_* session variables to the operator identity", async () => {
    // NOTE: the role variable is `app.current_role` (read by the app_role()
    // RLS helper), not `app.current_user_role`.
    const settings = await withMcpSession(sessionA, async (exec) => {
      const { rows } = await exec.query<{ account: string; user: string; role: string }>(
        `SELECT current_setting('app.current_account_id', true) AS account,
                current_setting('app.current_user_id', true)    AS "user",
                current_setting('app.current_role', true)        AS role`,
      );
      return rows[0];
    });

    expect(settings.account).toBe(ACCOUNT_A);
    expect(settings.user).toBe(OWNER_A_ID);
    expect(settings.role).toBe("owner");
  });

  // ---------------------------------------------------------------------------
  // 2. Owner / admin can operate; 3. tech is rejected at startup
  // ---------------------------------------------------------------------------
  it("resolves an owner operator and runs a read-only tool", async () => {
    process.env.DOVETAILS_MCP_USER_EMAIL = OWNER_A_EMAIL;
    delete process.env.DOVETAILS_MCP_USER_ID;
    const session = await resolveSession();
    expect(session.role).toBe("owner");
    expect(session.accountId).toBe(ACCOUNT_A);

    const result = (await withMcpSession(session, (exec) =>
      searchClients(exec, session, { query: "MCP-IT Client" }),
    )) as { count: number; clients: Array<{ id: string }> };
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.clients.map((c) => c.id)).toContain(clientAId);
  });

  it("resolves an admin operator", async () => {
    process.env.DOVETAILS_MCP_USER_EMAIL = ADMIN_A_EMAIL;
    const session = await resolveSession();
    expect(session.role).toBe("admin");
    expect(session.accountId).toBe(ACCOUNT_A);
  });

  it("resolves a second-account owner to that account", async () => {
    process.env.DOVETAILS_MCP_USER_EMAIL = OWNER_B_EMAIL;
    const session = await resolveSession();
    expect(session.role).toBe("owner");
    expect(session.accountId).toBe(ACCOUNT_B);
  });

  it("rejects a tech operator before startup", async () => {
    process.env.DOVETAILS_MCP_USER_EMAIL = TECH_A_EMAIL;
    await expect(resolveSession()).rejects.toThrow(/owner\/admin only/);
  });

  it("rejects an unknown operator", async () => {
    process.env.DOVETAILS_MCP_USER_EMAIL = "nobody@test.com";
    await expect(resolveSession()).rejects.toThrow(/No user found/);
  });

  // ---------------------------------------------------------------------------
  // 4. Account scoping end-to-end (A must never see B)
  // ---------------------------------------------------------------------------
  it("scopes search_clients to the operator account", async () => {
    const result = (await withMcpSession(sessionA, (exec) =>
      searchClients(exec, sessionA, { query: "MCP-IT Client" }),
    )) as { clients: Array<{ id: string }> };
    const ids = result.clients.map((c) => c.id);
    expect(ids).toContain(clientAId);
    expect(ids).not.toContain(clientBId);
  });

  it("scopes list_unpaid_invoices to the operator account", async () => {
    const asA = (await withMcpSession(sessionA, (exec) =>
      listUnpaidInvoices(exec, sessionA, {}),
    )) as { invoices: Array<{ id: string }> };
    const idsA = asA.invoices.map((i) => i.id);
    expect(idsA).toContain(invoiceAId);
    expect(idsA).not.toContain(invoiceBId);

    const asB = (await withMcpSession(sessionB, (exec) =>
      listUnpaidInvoices(exec, sessionB, {}),
    )) as { invoices: Array<{ id: string }> };
    const idsB = asB.invoices.map((i) => i.id);
    expect(idsB).toContain(invoiceBId);
    expect(idsB).not.toContain(invoiceAId);
  });

  it("scopes get_recent_payments to the operator account", async () => {
    const asA = (await withMcpSession(sessionA, (exec) =>
      getRecentPayments(exec, sessionA, { limit: 100 }),
    )) as { payments: Array<{ id: string }> };
    const ids = asA.payments.map((p) => p.id);
    expect(ids).toContain(paymentAId);
    // account B's payment id is not even captured — assert by checking B's
    // invoice number never appears.
    const numbers = (asA.payments as Array<{ invoice_number?: string }>).map(
      (p) => p.invoice_number,
    );
    expect(numbers).not.toContain(INVOICE_B_NUMBER);
  });

  it("cannot read another account's invoice by number", async () => {
    // INV-B1 exists, but not for account A.
    await expect(
      withMcpSession(sessionA, (exec) =>
        getInvoiceStatus(exec, sessionA, { invoice_number: INVOICE_B_NUMBER }),
      ),
    ).rejects.toThrow(/No invoice/);

    // sanity: account A can read its own invoice (paid 40000 of 100000)
    const own = (await withMcpSession(sessionA, (exec) =>
      getInvoiceStatus(exec, sessionA, { invoice_number: INVOICE_A_NUMBER }),
    )) as { balance: { cents: number } };
    expect(own.balance.cents).toBe(60000);
  });

  it("cannot read another account's client summary", async () => {
    await expect(
      withMcpSession(sessionA, (exec) => getClientSummary(exec, sessionA, { client_id: clientBId })),
    ).rejects.toThrow(/No client/);
  });

  // ---------------------------------------------------------------------------
  // 5. Read-only transaction enforcement
  // ---------------------------------------------------------------------------
  it("rejects INSERT inside the MCP read-only session", async () => {
    await expect(
      withMcpSession(sessionA, (exec) =>
        exec.query(
          `INSERT INTO clients (account_id, name) VALUES ($1, 'should-not-write')`,
          [ACCOUNT_A],
        ),
      ),
    ).rejects.toThrow(/read-only transaction/);

    // confirm nothing was written
    const { rows } = await db.query<{ c: string }>(
      `SELECT COUNT(*)::int AS c FROM clients WHERE name = 'should-not-write'`,
    );
    expect(Number(rows[0].c)).toBe(0);
  });

  it("rejects UPDATE inside the MCP read-only session", async () => {
    await expect(
      withMcpSession(sessionA, (exec) =>
        exec.query(`UPDATE invoices SET notes = 'tampered' WHERE id = $1`, [invoiceAId]),
      ),
    ).rejects.toThrow(/read-only transaction/);

    const { rows } = await db.query<{ notes: string | null }>(
      `SELECT notes FROM invoices WHERE id = $1`,
      [invoiceAId],
    );
    expect(rows[0].notes).toBeNull();
  });
});
