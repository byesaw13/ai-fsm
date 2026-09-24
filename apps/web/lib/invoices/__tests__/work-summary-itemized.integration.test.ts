/**
 * Integration (TASK-157, migration 193): work summary is frozen once sent, and
 * the itemized receipts loader honors receipt- and item-level billable flags.
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client, Pool } from "pg";
import { loadItemizedReceipts } from "../itemized-receipts";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("work summary + itemized receipts", () => {
  let client: Client;
  let pool: Pool;
  let clientId: string;
  let jobId: string;
  const invoiceIds: string[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query(
      `SELECT set_config('app.current_account_id',$1,false),
              set_config('app.current_user_id',$2,false),
              set_config('app.current_role','owner',false)`,
      [SEED_ACCOUNT, SEED_OWNER],
    );
    clientId = (
      await client.query(`INSERT INTO clients (account_id, name) VALUES ($1, 'Itemized Test') RETURNING id`, [SEED_ACCOUNT])
    ).rows[0].id;
    jobId = (
      await client.query(
        `INSERT INTO jobs (account_id, client_id, title, created_by) VALUES ($1,$2,'Itemized job',$3) RETURNING id`,
        [SEED_ACCOUNT, clientId, SEED_OWNER],
      )
    ).rows[0].id;

    const receipt = async (amount: number, billable = true) =>
      (
        await client.query(
          `INSERT INTO expenses (account_id, job_id, vendor_name, category, amount_cents, expense_date, created_by, billable)
           VALUES ($1,$2,'Home Depot','materials',$3,'2026-09-01',$4,$5) RETURNING id`,
          [SEED_ACCOUNT, jobId, amount, SEED_OWNER, billable],
        )
      ).rows[0].id as string;
    const item = (expenseId: string, name: string, cents: number, billable = true) =>
      client.query(
        `INSERT INTO expense_line_items (account_id, expense_id, name, quantity, unit_cost_cents, billable)
         VALUES ($1,$2,$3,1,$4,$5)`,
        [SEED_ACCOUNT, expenseId, name, cents, billable],
      );

    const a = await receipt(5000);
    await item(a, "Lumber", 4000);
    await item(a, "Drink", 1000, false);
    await receipt(2500); // unitemized
    await receipt(9999, false); // duplicate, excluded
  });

  afterAll(async () => {
    for (const id of invoiceIds) await client.query(`DELETE FROM invoices WHERE id = $1`, [id]);
    await client.query(`DELETE FROM expenses WHERE job_id = $1`, [jobId]);
    await client.query(`DELETE FROM jobs WHERE id = $1`, [jobId]);
    await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
    await pool.end();
  });

  it("totals only billable receipts and items", async () => {
    const res = await loadItemizedReceipts(pool, SEED_ACCOUNT, jobId);
    expect(res.receipts).toHaveLength(2);
    expect(res.receipts[0].items.map((i) => i.name)).toEqual(["Lumber"]);
    expect(res.total_cents).toBe(4000 + 2500);
  });

  it("work summary edits in draft and is frozen once sent", async () => {
    const id = (
      await client.query(
        `INSERT INTO invoices (account_id, client_id, job_id, status, invoice_kind, invoice_number,
           subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, created_by)
         VALUES ($1,$2,$3,'draft','final',$4,100,0,100,0,0,$5) RETURNING id`,
        [SEED_ACCOUNT, clientId, jobId, `WS-${Date.now()}`, SEED_OWNER],
      )
    ).rows[0].id as string;
    invoiceIds.push(id);

    await client.query(`UPDATE invoices SET work_summary = 'Kitchen\n• Painted', show_itemized_receipts = true WHERE id = $1`, [id]);
    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    await expect(client.query(`UPDATE invoices SET work_summary = 'changed' WHERE id = $1`, [id])).rejects.toThrow();
    await expect(client.query(`UPDATE invoices SET show_itemized_receipts = false WHERE id = $1`, [id])).rejects.toThrow();
  });
});
