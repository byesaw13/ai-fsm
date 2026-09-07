/**
 * Integration: a FINAL invoice credits BOTH deposit and progress invoices
 * (TASK-120, A0b staged billing).
 *
 * loadCreditedInvoicesForEstimate is the single loader every final-invoice path
 * (Convert + auto-final-on-completion) now uses. This proves it returns the
 * deposit + non-void progress invoices, and that reconcileFinalInvoice credits
 * them so the stages sum to exactly the project total — never more.
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { loadCreditedInvoicesForEstimate } from "../db";
import { reconcileFinalInvoice } from "../billing";

const RUN = !!process.env.TEST_DATABASE_URL;
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const TOTAL = 300_00;

describe.skipIf(!RUN)("final invoice credits deposit + progress", () => {
  let client: Client;
  let clientId: string;
  let estimateId: string;
  const invoiceIds: string[] = [];

  const makeInvoice = async (kind: string, totalCents: number, status = "sent") => {
    const num = `PROG-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const { rows } = await client.query(
      `INSERT INTO invoices
         (account_id, client_id, estimate_id, status, invoice_kind, invoice_number,
          subtotal_cents, tax_cents, total_cents, paid_cents, deposit_cents, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,0,$7,0,0,$8) RETURNING id`,
      [SEED_ACCOUNT, clientId, estimateId, status, kind, num, totalCents, SEED_OWNER],
    );
    invoiceIds.push(rows[0].id);
    return rows[0].id as string;
  };

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
      `INSERT INTO clients (account_id, name) VALUES ($1, 'Progress Test') RETURNING id`,
      [SEED_ACCOUNT],
    );
    clientId = c.rows[0].id;
    const e = await client.query(
      `INSERT INTO estimates (account_id, client_id, created_by, total_cents)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [SEED_ACCOUNT, clientId, SEED_OWNER, TOTAL],
    );
    estimateId = e.rows[0].id;

    await makeInvoice("deposit", 100_00); // ⅓ up front
    await makeInvoice("progress", 100_00); // ⅓ midpoint
    await makeInvoice("progress", 50_00, "void"); // voided — must NOT credit
    await makeInvoice("standard", 999_00); // unrelated kind — must NOT credit
  });

  afterAll(async () => {
    for (const id of invoiceIds) await client.query(`DELETE FROM invoices WHERE id = $1`, [id]);
    if (estimateId) await client.query(`DELETE FROM estimates WHERE id = $1`, [estimateId]);
    if (clientId) await client.query(`DELETE FROM clients WHERE id = $1`, [clientId]);
    await client.end();
  });

  it("loader returns deposit + progress invoices (not standard/final)", async () => {
    const rows = await loadCreditedInvoicesForEstimate(client, estimateId, SEED_ACCOUNT);
    // deposit + 2 progress (incl. the void one — reconcile filters void, not the loader)
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.total_cents !== 999_00)).toBe(true);
  });

  it("final credits deposit + non-void progress, balance = total − both", async () => {
    const rows = await loadCreditedInvoicesForEstimate(client, estimateId, SEED_ACCOUNT);
    const rec = reconcileFinalInvoice({ invoiceTotalCents: TOTAL, depositInvoices: rows });
    // 100_00 deposit + 100_00 progress (void 50_00 excluded) = 200_00 credit.
    expect(rec.depositCreditCents).toBe(200_00);
    expect(rec.balanceDueCents).toBe(100_00);
    // The whole point: stages + balance sum to exactly the project total.
    expect(rec.depositCreditCents + rec.balanceDueCents).toBe(TOTAL);
    // Note must not mislabel a mixed deposit+progress credit as "deposit".
    expect(rec.reconciliationNote).toContain("payments already invoiced");
  });
});
