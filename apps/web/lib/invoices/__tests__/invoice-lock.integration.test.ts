/**
 * Integration: what may change on an invoice in each state (TASK-251).
 * Pins enforce_invoice_immutability's behavior so migration 219 can rebuild it
 * around one list of document columns without changing what it allows.
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";

describe.skipIf(!RUN)("invoice lock rules (TASK-251)", () => {
  let client: Client;
  let clientId: string;
  const jobIds: string[] = [];
  const newJob = async () => {
    const id = (await client.query(
      `INSERT INTO jobs (account_id, client_id, title, created_by) VALUES ($1,$2,'Lock test',$3) RETURNING id`,
      [SEED_ACCOUNT, clientId, SEED_OWNER],
    )).rows[0].id as string;
    jobIds.push(id);
    return id;
  };

  const make = async (state: "draft" | "sent" | "paid" | "void") => {
    const { rows } = await client.query(
      `INSERT INTO invoices
         (account_id, client_id, status, invoice_kind, invoice_number,
          subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, notes, created_by)
       VALUES ($1,$2,'draft','standard',$3,10000,0,10000,0,0,'original',$4) RETURNING id`,
      [SEED_ACCOUNT, clientId, `LOCK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, SEED_OWNER],
    );
    const id = rows[0].id as string;
    if (state === "draft") return id;
    await client.query(`UPDATE invoices SET status = 'sent' WHERE id = $1`, [id]);
    if (state === "paid") {
      await client.query(
        `INSERT INTO payments (account_id, invoice_id, amount_cents, method, status, created_by)
         VALUES ($1,$2,10000,'cash','paid',$3)`,
        [SEED_ACCOUNT, id, SEED_OWNER],
      );
    }
    if (state === "void") await client.query(`UPDATE invoices SET status = 'void' WHERE id = $1`, [id]);
    return id;
  };
  const set = (id: string, assignments: string, ...values: unknown[]) =>
    client.query(`UPDATE invoices SET ${assignments} WHERE id = $1`, [id, ...values]);
  const row = async (id: string) =>
    (await client.query(`SELECT status, sent_at, paid_at, notes, due_date FROM invoices WHERE id = $1`, [id])).rows[0];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    await client.query(
      `SELECT set_config('app.current_account_id',$1,false),
              set_config('app.current_user_id',$2,false),
              set_config('app.current_role','owner',false)`,
      [SEED_ACCOUNT, SEED_OWNER],
    );
    clientId = (await client.query(
      `INSERT INTO clients (account_id, name) VALUES ($1, 'Lock Test') RETURNING id`, [SEED_ACCOUNT],
    )).rows[0].id;
  });

  afterAll(async () => {
    await client.query(`DELETE FROM invoices WHERE client_id = $1`, [clientId]);
    for (const id of jobIds) await client.query(`DELETE FROM jobs WHERE id = $1`, [id]);
    await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
  });

  it("a draft can change anything", async () => {
    const id = await make("draft");
    await set(id, `notes = 'edited', total_cents = 20000, subtotal_cents = 20000, work_summary = 'w'`);
    expect((await row(id)).notes).toBe("edited");
  });

  it("sending stamps sent_at", async () => {
    const id = await make("sent");
    expect((await row(id)).sent_at).not.toBeNull();
  });

  it("a sent invoice records customer views", async () => {
    const id = await make("sent");
    await expect(set(id, `first_viewed_at = now(), last_viewed_at = now(), view_count = 1`)).resolves.toBeDefined();
  });

  it.each([
    ["notes", `notes = 'changed'`],
    ["total", `total_cents = 1, subtotal_cents = 1`],
    ["work summary", `work_summary = 'changed'`],
    ["itemized receipts", `show_itemized_receipts = NOT show_itemized_receipts`],
    ["business purpose", `business_purpose = 'changed'`],
    ["invoice number", `invoice_number = invoice_number || '-x'`],
    ["sent_at", `sent_at = now() - interval '1 day'`],
  ])("a sent invoice refuses a change to %s", async (_label, assignment) => {
    const id = await make("sent");
    await expect(set(id, assignment)).rejects.toThrow(/only paid_cents, status, and one-time due_date/);
  });

  it("a sent invoice fills an empty due date once, then keeps it", async () => {
    const id = await make("sent");
    await set(id, `due_date = NULL`).catch(() => undefined);
    if ((await row(id)).due_date === null) {
      await expect(set(id, `due_date = current_date + 7`)).resolves.toBeDefined();
    }
    await expect(set(id, `due_date = current_date + 30`)).rejects.toThrow(/one-time due_date/);
  });

  it("a sent invoice can be linked to a job (document link)", async () => {
    const id = await make("sent");
    await expect(set(id, `job_id = $2`, await newJob())).resolves.toBeDefined();
  });

  it("a paid invoice can be linked to a job but not edited", async () => {
    const id = await make("paid");
    expect((await row(id)).status).toBe("paid");
    expect((await row(id)).paid_at).not.toBeNull();
    await expect(set(id, `job_id = $2`, await newJob())).resolves.toBeDefined();
    await expect(set(id, `notes = 'changed'`)).rejects.toThrow(/paid state is immutable/);
  });

  it("a void invoice refuses even a link", async () => {
    const id = await make("void");
    await expect(set(id, `job_id = $2`, await newJob())).rejects.toThrow(/void state is immutable/);
  });

  it("reopen clears sent_at; reopen with an edit in the same update is refused", async () => {
    const id = await make("sent");
    await expect(set(id, `status = 'draft', notes = 'sneaky'`)).rejects.toThrow(/may only change status and sent_at/);
    await set(id, `status = 'draft'`);
    expect(await row(id)).toMatchObject({ status: "draft", sent_at: null });
  });

  it("re-sending a reopened invoice that holds payments lands on partial", async () => {
    const id = await make("sent");
    await client.query(
      `INSERT INTO payments (account_id, invoice_id, amount_cents, method, status, created_by)
       VALUES ($1,$2,4000,'cash','paid',$3)`,
      [SEED_ACCOUNT, id, SEED_OWNER],
    );
    await set(id, `status = 'draft'`);
    await set(id, `notes = 'edited while reopened'`);
    await set(id, `status = 'sent'`);
    expect((await row(id)).status).toBe("partial");
  });
});
