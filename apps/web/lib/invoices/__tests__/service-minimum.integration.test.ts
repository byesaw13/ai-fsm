/**
 * Integration: applyServiceMinimum against a real draft invoice (TASK-119 slice 2).
 *
 * Proves the orchestration the pure planner can't: it maintains a single
 * "Service minimum" adjustment line, floors the total, is idempotent, and removes
 * the line once real charges reach the minimum.
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { applyServiceMinimum, SERVICE_MINIMUM_LABEL } from "../service-minimum";
import { createInvoiceLineItem, recalculateInvoiceTotals } from "../line-items";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("applyServiceMinimum", () => {
  let client: Client;
  let clientId: string;
  let invoiceId: string;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query(
      `SELECT set_config('app.current_account_id',$1,false),
              set_config('app.current_user_id',$2,false),
              set_config('app.current_role','owner',false)`,
      [SEED_ACCOUNT, SEED_OWNER],
    );
    const c = await client.query(
      `INSERT INTO clients (account_id, name) VALUES ($1, 'Service-Min Test') RETURNING id`,
      [SEED_ACCOUNT],
    );
    clientId = c.rows[0].id;
    const num = `SVCMIN-${Date.now()}`;
    const inv = await client.query(
      `INSERT INTO invoices (account_id, client_id, invoice_number, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [SEED_ACCOUNT, clientId, num, SEED_OWNER],
    );
    invoiceId = inv.rows[0].id;
    // One small labor line: $50, well below any service minimum.
    await createInvoiceLineItem(client, invoiceId, {
      description: "Labor",
      quantity: 1,
      unit_price_cents: 50_00,
      line_item_type: "labor",
    });
    await recalculateInvoiceTotals(client, invoiceId, SEED_ACCOUNT);
  });

  afterAll(async () => {
    if (invoiceId) await client.query(`DELETE FROM invoice_line_items WHERE invoice_id = $1`, [invoiceId]);
    if (invoiceId) await client.query(`DELETE FROM invoices WHERE id = $1`, [invoiceId]);
    if (clientId) await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
  });

  const minLine = async () => {
    const { rows } = await client.query(
      `SELECT total_cents FROM invoice_line_items
        WHERE invoice_id = $1 AND line_item_type = 'adjustment' AND description = $2`,
      [invoiceId, SERVICE_MINIMUM_LABEL],
    );
    return rows;
  };

  it("floors a below-minimum invoice by adding one Service minimum line", async () => {
    const totals = await applyServiceMinimum(client, invoiceId, SEED_ACCOUNT);
    const lines = await minLine();
    expect(lines).toHaveLength(1);
    // total is now the minimum; the top-up = minimum - $50 base
    expect(totals.total_cents).toBeGreaterThan(50_00);
    expect(Number(lines[0].total_cents)).toBe(totals.total_cents - 50_00);
  });

  it("is idempotent — re-applying keeps exactly one line and the same total", async () => {
    const first = (await applyServiceMinimum(client, invoiceId, SEED_ACCOUNT)).total_cents;
    const second = (await applyServiceMinimum(client, invoiceId, SEED_ACCOUNT)).total_cents;
    expect(second).toBe(first);
    expect(await minLine()).toHaveLength(1);
  });

  it("removes the Service minimum line once real charges exceed the minimum", async () => {
    await createInvoiceLineItem(client, invoiceId, {
      description: "Big materials",
      quantity: 1,
      unit_price_cents: 1000_00,
      line_item_type: "materials",
    });
    const totals = await applyServiceMinimum(client, invoiceId, SEED_ACCOUNT);
    expect(await minLine()).toHaveLength(0);
    expect(totals.total_cents).toBe(1050_00); // $50 labor + $1000 materials
  });
});
