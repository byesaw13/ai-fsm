/**
 * Integration: one function creates invoices, with one duplicate rule backed by
 * unique indexes (TASK-247, migration 218).
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client, type PoolClient } from "pg";
import { createInvoice, type NewInvoice } from "../create-invoice";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("createInvoice (TASK-247)", () => {
  let client: Client;
  let db: PoolClient;
  let clientId: string;
  const jobIds: string[] = [];
  const estimateIds: string[] = [];

  const job = async () => {
    const { rows } = await client.query(
      `INSERT INTO jobs (account_id, client_id, title, created_by) VALUES ($1,$2,'Create invoice test',$3) RETURNING id`,
      [SEED_ACCOUNT, clientId, SEED_OWNER],
    );
    jobIds.push(rows[0].id);
    return rows[0].id as string;
  };
  const estimate = async (jobId: string) => {
    const { rows } = await client.query(
      `INSERT INTO estimates (account_id, client_id, job_id, created_by, total_cents) VALUES ($1,$2,$3,$4,100000) RETURNING id`,
      [SEED_ACCOUNT, clientId, jobId, SEED_OWNER],
    );
    estimateIds.push(rows[0].id);
    return rows[0].id as string;
  };
  const base = (kind: NewInvoice["invoice_kind"], extra: Partial<NewInvoice> = {}): NewInvoice => ({
    account_id: SEED_ACCOUNT,
    client_id: clientId,
    invoice_kind: kind,
    created_by: SEED_OWNER,
    subtotal_cents: 50_000,
    tax_cents: 0,
    total_cents: 50_000,
    ...extra,
  });
  const voidIt = async (id: string) => {
    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    await client.query(`UPDATE invoices SET status = 'void' WHERE id = $1`, [id]);
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    db = client as unknown as PoolClient;
    await client.query(
      `SELECT set_config('app.current_account_id',$1,false),
              set_config('app.current_user_id',$2,false),
              set_config('app.current_role','owner',false)`,
      [SEED_ACCOUNT, SEED_OWNER],
    );
    const c = await client.query(
      `INSERT INTO clients (account_id, name) VALUES ($1, 'Create Invoice Test') RETURNING id`,
      [SEED_ACCOUNT],
    );
    clientId = c.rows[0].id;
  });

  afterAll(async () => {
    await client.query(`DELETE FROM invoices WHERE client_id = $1`, [clientId]);
    for (const id of estimateIds) await client.query(`DELETE FROM estimates WHERE id = $1`, [id]);
    for (const id of jobIds) await client.query(`DELETE FROM jobs WHERE id = $1`, [id]);
    await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
  });

  it("convert after a manual invoice on the same job returns the manual one", async () => {
    const j = await job();
    const e = await estimate(j);
    const manual = await createInvoice(db, base("final", { job_id: j }));
    expect(manual.created).toBe(true);

    const convert = await createInvoice(db, base("final", { job_id: j, estimate_id: e }));
    expect(convert).toMatchObject({ id: manual.id, created: false });
  });

  it("an older standard invoice on the job also counts", async () => {
    const j = await job();
    const std = await createInvoice(db, base("standard", { job_id: j }));
    const fin = await createInvoice(db, base("final", { job_id: j }));
    expect(fin).toMatchObject({ id: std.id, created: false });
  });

  it("a voided deposit does not block a new deposit", async () => {
    const j = await job();
    const e = await estimate(j);
    const first = await createInvoice(db, base("deposit", { job_id: j, estimate_id: e }));
    expect((await createInvoice(db, base("deposit", { job_id: j, estimate_id: e }))).id).toBe(first.id);
    await voidIt(first.id);
    const second = await createInvoice(db, base("deposit", { job_id: j, estimate_id: e }));
    expect(second.created).toBe(true);
    expect(second.id).not.toBe(first.id);
  });

  it("a voided final can be replaced", async () => {
    const j = await job();
    const e = await estimate(j);
    const first = await createInvoice(db, base("final", { job_id: j, estimate_id: e }));
    await voidIt(first.id);
    expect((await createInvoice(db, base("final", { job_id: j, estimate_id: e }))).created).toBe(true);
  });

  it("progress invoices are not deduped", async () => {
    const j = await job();
    const e = await estimate(j);
    const a = await createInvoice(db, base("progress", { job_id: j, estimate_id: e }));
    const b = await createInvoice(db, base("progress", { job_id: j, estimate_id: e }));
    expect(a.created && b.created && a.id !== b.id).toBe(true);
  });

  it("the database refuses a second open final on a job, whatever path writes it", async () => {
    const j = await job();
    await createInvoice(db, base("final", { job_id: j }));
    await expect(
      client.query(
        `INSERT INTO invoices (account_id, client_id, job_id, status, invoice_kind, invoice_number,
           subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, created_by)
         VALUES ($1,$2,$3,'draft','final',$4,1,0,1,0,0,$5)`,
        [SEED_ACCOUNT, clientId, j, `DUP-${Date.now()}`, SEED_OWNER],
      ),
    ).rejects.toThrow(/idx_invoices_one_final_per_job/);
  });
});
