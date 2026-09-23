/**
 * Integration: a partially paid invoice can be reopened, edited, and re-sent
 * with its payments intact (TASK-154, migration 192). T&M invoices change after
 * the first payment as true materials + time land.
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("reopen partially paid invoice", () => {
  let client: Client;
  let clientId: string;
  const invoiceIds: string[] = [];

  const status = async (id: string) =>
    (await client.query(`SELECT status, paid_cents, total_cents, sent_at FROM invoices WHERE id = $1`, [id]))
      .rows[0];

  const makePartial = async (totalCents: number, paidCents: number) => {
    const { rows } = await client.query(
      `INSERT INTO invoices
         (account_id, client_id, status, invoice_kind, invoice_number,
          subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, created_by)
       VALUES ($1,$2,'draft','standard',$3,$4,0,$4,0,0,$5) RETURNING id`,
      [SEED_ACCOUNT, clientId, `REOPEN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, totalCents, SEED_OWNER],
    );
    const id = rows[0].id as string;
    invoiceIds.push(id);
    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    await pay(id, paidCents);
    return id;
  };

  const pay = (invoiceId: string, cents: number) =>
    client.query(
      `INSERT INTO payments (account_id, invoice_id, amount_cents, method, status, created_by)
       VALUES ($1,$2,$3,'cash','paid',$4)`,
      [SEED_ACCOUNT, invoiceId, cents, SEED_OWNER],
    );

  // The edit path: invoice totals are rewritten while in draft.
  const setTotal = (id: string, cents: number) =>
    client.query(`UPDATE invoices SET subtotal_cents = $2, total_cents = $2 WHERE id = $1`, [id, cents]);

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
      `INSERT INTO clients (account_id, name) VALUES ($1, 'Reopen Test') RETURNING id`,
      [SEED_ACCOUNT],
    );
    clientId = c.rows[0].id;
  });

  afterAll(async () => {
    for (const id of invoiceIds) {
      await client.query(`DELETE FROM payments WHERE invoice_id = $1`, [id]);
      await client.query(`DELETE FROM invoices WHERE id = $1`, [id]);
    }
    if (clientId) await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
  });

  it("reopens a partial invoice to draft and keeps its payments", async () => {
    const id = await makePartial(13_535_00, 4_060_50);
    expect((await status(id)).status).toBe("partial");

    await client.query(`UPDATE invoices SET status = 'draft' WHERE id = $1`, [id]);
    const s = await status(id);
    expect(s.status).toBe("draft");
    expect(s.paid_cents).toBe(4_060_50);
    expect(s.sent_at).toBeNull();
  });

  it("re-sending an edited invoice with payments lands on partial, not sent", async () => {
    const id = await makePartial(13_535_00, 4_060_50);
    await client.query(`UPDATE invoices SET status = 'draft' WHERE id = $1`, [id]);
    await setTotal(id, 14_571_02);

    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    const s = await status(id);
    expect(s.status).toBe("partial");
    expect(s.total_cents).toBe(14_571_02);
    expect(s.paid_cents).toBe(4_060_50);
    expect(s.sent_at).not.toBeNull();
  });

  it("re-sending when payments already cover the new total lands on paid", async () => {
    const id = await makePartial(10_000_00, 4_000_00);
    await client.query(`UPDATE invoices SET status = 'draft' WHERE id = $1`, [id]);
    await setTotal(id, 4_000_00);

    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    expect((await status(id)).status).toBe("paid");
  });

  it("a payment landing while reopened updates paid_cents but stays draft", async () => {
    const id = await makePartial(10_000_00, 1_000_00);
    await client.query(`UPDATE invoices SET status = 'draft' WHERE id = $1`, [id]);

    await pay(id, 2_000_00);
    const s = await status(id);
    expect(s.status).toBe("draft");
    expect(s.paid_cents).toBe(3_000_00);
  });

  it("reopen still cannot change the payment total", async () => {
    const id = await makePartial(10_000_00, 1_000_00);
    await expect(
      client.query(`UPDATE invoices SET status = 'draft', paid_cents = 0 WHERE id = $1`, [id]),
    ).rejects.toThrow();
  });

  it("an unpaid draft still cannot jump straight to partial", async () => {
    const { rows } = await client.query(
      `INSERT INTO invoices
         (account_id, client_id, status, invoice_kind, invoice_number,
          subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, created_by)
       VALUES ($1,$2,'draft','standard',$3,100,0,100,0,0,$4) RETURNING id`,
      [SEED_ACCOUNT, clientId, `REOPEN-U-${Date.now()}`, SEED_OWNER],
    );
    invoiceIds.push(rows[0].id);
    await expect(
      client.query(`UPDATE invoices SET status = 'partial' WHERE id = $1`, [rows[0].id]),
    ).rejects.toThrow(/invalid invoice transition/);
  });
});
