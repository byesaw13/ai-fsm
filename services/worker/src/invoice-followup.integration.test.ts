import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  findDueFollowups,
  findOverdueInvoices,
  emitInvoiceFollowup,
  processInvoiceFollowup,
  runInvoiceFollowups,
} from "./invoice-followup.js";
import type { AutomationRow, OverdueInvoice } from "./invoice-followup.js";

/**
 * Integration tests for invoice-followup automation.
 *
 * Requires TEST_DATABASE_URL to be set and pointing to a
 * PostgreSQL instance with migrations applied.
 */

const shouldRun = !!process.env.TEST_DATABASE_URL;

describe("invoice-followup integration (requires DB)", () => {
  it.skipIf(!shouldRun)("skips when TEST_DATABASE_URL is not set", () => {
    expect(true).toBe(true);
  });
});

describe.skipIf(!shouldRun)("invoice-followup integration", () => {
  let client: Client;
  let accountId: string;
  let userId: string;
  let clientEntityId: string;
  let invoiceId: string;
  let automationId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();

    // Create test account
    const accRes = await client.query(
      `INSERT INTO accounts (name) VALUES ('followup-test-account') RETURNING id`
    );
    accountId = accRes.rows[0].id;

    // Create test user
    const userRes = await client.query(
      `INSERT INTO users (account_id, email, password_hash, full_name, role)
       VALUES ($1, 'followup-test@test.com', 'hash', 'Test User', 'owner') RETURNING id`,
      [accountId]
    );
    userId = userRes.rows[0].id;

    // Create test client entity
    const clientRes = await client.query(
      `INSERT INTO clients (account_id, name, email)
       VALUES ($1, 'Follow-Up Test Client', 'followup@client.com') RETURNING id`,
      [accountId]
    );
    clientEntityId = clientRes.rows[0].id;

    // Create an overdue invoice (due 10 days ago)
    const invRes = await client.query(
      `INSERT INTO invoices (account_id, client_id, invoice_number, status, total_cents, paid_cents, due_date, created_by)
       VALUES ($1, $2, 'INV-FU-001', 'overdue', 50000, 10000, now() - interval '10 days', $3) RETURNING id`,
      [accountId, clientEntityId, userId]
    );
    invoiceId = invRes.rows[0].id;

    // Create invoice_followup automation (due now)
    const autoRes = await client.query(
      `INSERT INTO automations (account_id, type, config, next_run_at)
       VALUES ($1, 'invoice_followup', '{"days_overdue": [7, 14, 30]}'::jsonb, now() - interval '1 minute') RETURNING id`,
      [accountId]
    );
    automationId = autoRes.rows[0].id;
  });

  afterAll(async () => {
    if (client) {
      // Clean up in reverse dependency order
      await client.query(`DELETE FROM audit_log WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM automations WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM invoices WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM clients WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM users WHERE account_id = $1`, [accountId]);
      await client.query(`DELETE FROM accounts WHERE id = $1`, [accountId]);
      await client.end();
    }
  });

  it("findDueFollowups returns the test automation", async () => {
    const results = await findDueFollowups(client);
    const found = results.find((a) => a.id === automationId);
    expect(found).toBeDefined();
    expect(found!.type).toBe("invoice_followup");
  });

  it("findOverdueInvoices returns the overdue invoice", async () => {
    const automation: AutomationRow = {
      id: automationId,
      account_id: accountId,
      type: "invoice_followup",
      config: { days_overdue: [7, 14, 30] },
      enabled: true,
      next_run_at: new Date().toISOString(),
    };

    const invoices = await findOverdueInvoices(client, automation);
    const found = invoices.find((i) => i.id === invoiceId);
    expect(found).toBeDefined();
    expect(found!.invoice_number).toBe("INV-FU-001");
    expect(found!.client_name).toBe("Follow-Up Test Client");
  });

  it("emitInvoiceFollowup creates an audit_log entry", async () => {
    const invoice: OverdueInvoice = {
      id: invoiceId,
      account_id: accountId,
      client_id: clientEntityId,
      invoice_number: "INV-FU-001",
      status: "overdue",
      total_cents: 50000,
      paid_cents: 10000,
      due_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      client_name: "Follow-Up Test Client",
    };

    const emitted = await emitInvoiceFollowup(client, invoice, automationId, 7);
    expect(emitted).toBe(true);

    // Verify audit_log entry
    const { rows } = await client.query(
      `SELECT * FROM audit_log WHERE entity_type = 'invoice_followup' AND entity_id = $1`,
      [invoiceId]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].new_value.days_overdue_step).toBe(7);
  });

  it("emitInvoiceFollowup is idempotent (no duplicate for same cadence step)", async () => {
    const invoice: OverdueInvoice = {
      id: invoiceId,
      account_id: accountId,
      client_id: clientEntityId,
      invoice_number: "INV-FU-001",
      status: "overdue",
      total_cents: 50000,
      paid_cents: 10000,
      due_date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      client_name: "Follow-Up Test Client",
    };

    // Second attempt at same step should return false
    const emitted = await emitInvoiceFollowup(client, invoice, automationId, 7);
    expect(emitted).toBe(false);

    // Still only one entry
    const { rows } = await client.query(
      `SELECT * FROM audit_log WHERE entity_type = 'invoice_followup' AND entity_id = $1 AND new_value->>'days_overdue_step' = '7'`,
      [invoiceId]
    );
    expect(rows.length).toBe(1);
  });

  it("processInvoiceFollowup updates automation timestamps", async () => {
    // Clean audit log for fresh run
    await client.query(`DELETE FROM audit_log WHERE account_id = $1 AND entity_type = 'invoice_followup'`, [accountId]);
    // Reset automation
    await client.query(
      `UPDATE automations SET next_run_at = now() - interval '1 minute', last_run_at = NULL WHERE id = $1`,
      [automationId]
    );

    const automation: AutomationRow = {
      id: automationId,
      account_id: accountId,
      type: "invoice_followup",
      config: { days_overdue: [7, 14, 30] },
      enabled: true,
      next_run_at: new Date().toISOString(),
    };

    const result = await processInvoiceFollowup(client, automation);
    expect(result.sent).toBeGreaterThan(0);

    // Check timestamps updated
    const { rows } = await client.query(
      `SELECT last_run_at, next_run_at FROM automations WHERE id = $1`,
      [automationId]
    );
    expect(rows[0].last_run_at).not.toBeNull();
    expect(new Date(rows[0].next_run_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("runInvoiceFollowups processes end-to-end", async () => {
    // Clean audit log for fresh run
    await client.query(`DELETE FROM audit_log WHERE account_id = $1 AND entity_type = 'invoice_followup'`, [accountId]);
    // Reset automation
    await client.query(
      `UPDATE automations SET next_run_at = now() - interval '1 minute', last_run_at = NULL WHERE id = $1`,
      [automationId]
    );

    const results = await runInvoiceFollowups(client);
    const ours = results.find((r) => r.automationId === automationId);
    expect(ours).toBeDefined();
    expect(ours!.sent).toBeGreaterThan(0);
  });

  it("repeated runs don't duplicate follow-ups", async () => {
    // Run again immediately — should skip all
    await client.query(
      `UPDATE automations SET next_run_at = now() - interval '1 minute' WHERE id = $1`,
      [automationId]
    );

    const results = await runInvoiceFollowups(client);
    const ours = results.find((r) => r.automationId === automationId);
    expect(ours).toBeDefined();
    expect(ours!.sent).toBe(0);
    expect(ours!.skipped).toBeGreaterThan(0);
  });
});
