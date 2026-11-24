/**
 * Integration: deleting a payment updates the invoice through the database
 * trigger, the same rule as adding one (TASK-246).
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("payment delete updates the invoice (TASK-246)", () => {
  let client: Client;
  let clientId: string;
  const invoiceIds: string[] = [];

  const invoice = async (id: string) =>
    (await client.query(`SELECT status, paid_cents, paid_at FROM invoices WHERE id = $1`, [id])).rows[0];

  const pay = async (invoiceId: string, cents: number, status = "paid") =>
    (
      await client.query(
        `INSERT INTO payments (account_id, invoice_id, amount_cents, method, status, created_by)
         VALUES ($1,$2,$3,'cash',$4,$5) RETURNING id`,
        [SEED_ACCOUNT, invoiceId, cents, status, SEED_OWNER],
      )
    ).rows[0].id as string;

  const sentInvoice = async (totalCents: number) => {
    const { rows } = await client.query(
      `INSERT INTO invoices
         (account_id, client_id, status, invoice_kind, invoice_number,
          subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, created_by)
       VALUES ($1,$2,'draft','standard',$3,$4,0,$4,0,0,$5) RETURNING id`,
      [SEED_ACCOUNT, clientId, `PAYDEL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, totalCents, SEED_OWNER],
    );
    const id = rows[0].id as string;
    invoiceIds.push(id);
    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    return id;
  };

  const del = (paymentId: string) => client.query(`DELETE FROM payments WHERE id = $1`, [paymentId]);

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
      `INSERT INTO clients (account_id, name) VALUES ($1, 'Payment Delete Test') RETURNING id`,
      [SEED_ACCOUNT],
    );
    clientId = c.rows[0].id;
  });

  afterAll(async () => {
    for (const id of invoiceIds) await client.query(`DELETE FROM invoices WHERE id = $1`, [id]);
    if (clientId) await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
  });

  it("deleting one of two payments leaves the invoice partial with the right total", async () => {
    const id = await sentInvoice(10_000);
    const first = await pay(id, 3_000);
    await pay(id, 2_000);
    expect(await invoice(id)).toMatchObject({ status: "partial", paid_cents: 5_000 });

    await del(first);
    expect(await invoice(id)).toMatchObject({ status: "partial", paid_cents: 2_000 });
  });

  it("deleting the only payment puts the invoice back to sent with nothing paid", async () => {
    const id = await sentInvoice(10_000);
    const only = await pay(id, 4_000);
    expect((await invoice(id)).status).toBe("partial");

    await del(only);
    expect(await invoice(id)).toMatchObject({ status: "sent", paid_cents: 0, paid_at: null });
  });

  it("a reopened (draft) invoice stays draft after a payment delete", async () => {
    const id = await sentInvoice(10_000);
    const a = await pay(id, 3_000);
    await pay(id, 1_000);
    await client.query(`UPDATE invoices SET status = 'draft' WHERE id = $1`, [id]);

    await del(a);
    expect(await invoice(id)).toMatchObject({ status: "draft", paid_cents: 1_000 });
  });

  it("removing a pending payment link changes nothing", async () => {
    const id = await sentInvoice(10_000);
    await pay(id, 2_000);
    const pending = await pay(id, 8_000, "pending");

    await del(pending);
    expect(await invoice(id)).toMatchObject({ status: "partial", paid_cents: 2_000 });
  });

  it("deleting a payment on a paid invoice leaves the invoice alone", async () => {
    const id = await sentInvoice(10_000);
    const full = await pay(id, 10_000);
    expect((await invoice(id)).status).toBe("paid");

    await del(full);
    expect(await invoice(id)).toMatchObject({ status: "paid", paid_cents: 10_000 });
  });

  it("deleting an invoice with payments still works (cascade)", async () => {
    const id = await sentInvoice(10_000);
    await pay(id, 3_000);
    await expect(client.query(`DELETE FROM invoices WHERE id = $1`, [id])).resolves.toBeDefined();
    expect((await client.query(`SELECT 1 FROM payments WHERE invoice_id = $1`, [id])).rowCount).toBe(0);
  });
});
