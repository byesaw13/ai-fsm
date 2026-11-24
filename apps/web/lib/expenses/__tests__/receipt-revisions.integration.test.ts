/**
 * Receipt parse revisions against Postgres (TASK-211; design §3 "Receipts",
 * "Receipt reconciliation"; acceptance criteria 2 and 2b).
 *
 * Tier: database + HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * CI applies migrations, including 216, before this file runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, type PoolClient } from "pg";
import { restoreReceiptRevision, saveReceiptRevision, type RevisionActor } from "../receipt-revisions";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("receipt parse revisions", () => {
  const tag = `it211r${Date.now()}`;
  let pool: Pool;
  let actor: RevisionActor;

  async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const out = await fn(c);
      await c.query("COMMIT");
      return out;
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    } finally {
      c.release();
    }
  }

  const q = async <T>(sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as T[];

  const lines = (paint = 4298) => [
    { name: `${tag} Screws`, quantity: 1, unit_cost_cents: 997, sku: `${tag}-S1` },
    { name: `${tag} Paint`, quantity: 2, unit_cost_cents: paint, sku: `${tag}-P1` },
  ];

  async function receipt(amountCents: number): Promise<string> {
    const rows = await q<{ id: string }>(
      `INSERT INTO expenses (account_id, vendor_name, category, amount_cents, expense_date, notes, created_by)
       VALUES ($1, 'The Home Depot', 'materials', $2, '2026-04-02', $3, $4) RETURNING id`,
      [actor.accountId, amountCents, `${tag} receipt`, actor.userId],
    );
    return rows[0].id;
  }

  const active = (expenseId: string) =>
    q<{ dedupe_key: string; unit_price_cents: number; reconciled: boolean }>(
      `SELECT dedupe_key, unit_price_cents, reconciled FROM price_observations
       WHERE account_id = $1 AND source_ref = $2 AND status = 'active' ORDER BY dedupe_key`,
      [actor.accountId, `expense:${expenseId}`],
    );
  const lineIds = async (expenseId: string) =>
    (await q<{ id: string }>(`SELECT id FROM expense_line_items WHERE expense_id = $1 ORDER BY sort_order`, [expenseId])).map((r) => r.id);
  const current = async (expenseId: string) =>
    (await q<{ parse_revision: number }>(`SELECT parse_revision FROM expenses WHERE id = $1`, [expenseId]))[0].parse_revision;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const owner = (await q<{ id: string; account_id: string }>(`SELECT id, account_id FROM users WHERE email = 'owner@test.com'`))[0];
    actor = { accountId: owner.account_id, userId: owner.id };
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM expenses WHERE account_id = $1 AND notes LIKE $2`, [actor.accountId, `${tag}%`]);
    await pool.query(`DELETE FROM materials_price_book WHERE account_id = $1 AND name LIKE $2`, [actor.accountId, `${tag}%`]);
    await pool.end();
  });

  it("a re-parse is a new revision whose prices replace the previous ones; no duplicates though line IDs change", async () => {
    const id = await receipt(997 + 2 * 4298);
    const first = await tx((c) => saveReceiptRevision(c, actor, id, { origin: "parse", lineItems: lines() }));
    expect(first.revision).toBe(1);
    const idsBefore = await lineIds(id);
    const second = await tx((c) => saveReceiptRevision(c, actor, id, { origin: "parse", lineItems: lines() }));
    expect(second.revision).toBe(2);
    expect(await lineIds(id)).not.toEqual(idsBefore);
    const now = await active(id);
    expect(now).toHaveLength(2);
    expect(now.every((o) => o.dedupe_key.includes(":r2:"))).toBe(true);
    const counts = await q<{ purchase_count: number }>(
      `SELECT purchase_count FROM materials_price_book WHERE account_id = $1 AND sku = $2`, [actor.accountId, `${tag}-S1`],
    );
    expect(counts[0].purchase_count).toBe(1);
  });

  it("restoring an earlier revision brings its lines and prices back as the newest revision", async () => {
    const id = await receipt(997 + 2 * 4298);
    await tx((c) => saveReceiptRevision(c, actor, id, { origin: "parse", lineItems: lines() }));
    await tx((c) => saveReceiptRevision(c, actor, id, { origin: "edit", lineItems: lines(3999) }));
    expect((await active(id)).map((o) => o.unit_price_cents).sort((a, b) => a - b)).toEqual([997, 3999]);

    const restored = await tx((c) => restoreReceiptRevision(c, actor, id, 1));
    expect(restored.revision).toBe(3);
    expect(await current(id)).toBe(3);
    const now = await active(id);
    expect(now.map((o) => o.unit_price_cents).sort((a, b) => a - b)).toEqual([997, 4298]);
    expect(now.every((o) => o.dedupe_key.includes(":r3:"))).toBe(true);
    const restoredLines = await q<{ unit_cost_cents: number }>(
      `SELECT unit_cost_cents FROM expense_line_items WHERE expense_id = $1 ORDER BY sort_order`, [id],
    );
    expect(restoredLines.map((l) => l.unit_cost_cents)).toEqual([997, 4298]);
  });

  it("a restored version is reconciled against the expense total as it is now", async () => {
    const id = await receipt(997 + 2 * 4298);
    const first = await tx((c) => saveReceiptRevision(c, actor, id, { origin: "parse", lineItems: lines() }));
    expect(first.reconciliation.balanced).toBe(true);
    await tx((c) => saveReceiptRevision(c, actor, id, { origin: "edit", lineItems: lines(3999) }));
    await pool.query(`UPDATE expenses SET amount_cents = 20000 WHERE id = $1`, [id]); // total corrected since
    const restored = await tx((c) => restoreReceiptRevision(c, actor, id, 1));
    expect(restored.reconciliation.balanced).toBe(false);
    expect((await active(id)).every((o) => !o.reconciled)).toBe(true);
  });

  it("two concurrent re-parses of one receipt leave one current revision and one set of lines and prices", async () => {
    const id = await receipt(997 + 2 * 4298);
    await Promise.all([
      tx((c) => saveReceiptRevision(c, actor, id, { origin: "parse", lineItems: lines() })),
      tx((c) => saveReceiptRevision(c, actor, id, { origin: "parse", lineItems: lines() })),
    ]);
    const revs = await q<{ revision: number }>(`SELECT revision FROM expense_parse_revisions WHERE expense_id = $1 ORDER BY revision`, [id]);
    expect(revs.map((r) => r.revision)).toEqual([1, 2]);
    expect(await current(id)).toBe(2);
    expect(await lineIds(id)).toHaveLength(2);
    expect(await active(id)).toHaveLength(2);
  });

  it("a receipt that balances after tax, discounts and returns is reconciled; an unexplained mismatch is not", async () => {
    // Lines 997 + 8596 = 9593, less a 547 return and a 500 coupon = 8546, plus 534 tax = 9080.
    const balanced = await receipt(9080);
    const ok = await tx((c) =>
      saveReceiptRevision(c, actor, balanced, {
        origin: "parse",
        lineItems: lines(),
        taxCents: 534,
        adjustments: [
          { kind: "return", name: "RETURN caulk", amount_cents: -547 },
          { kind: "coupon", name: "COUPON", amount_cents: -500 },
        ],
      }),
    );
    expect(ok.reconciliation.balanced).toBe(true);
    expect((await active(balanced)).every((o) => o.reconciled)).toBe(true);

    // A hand edit keeps the parse's tax and adjustments.
    const edited = await tx((c) => saveReceiptRevision(c, actor, balanced, { origin: "edit", lineItems: lines() }));
    expect(edited.reconciliation.balanced).toBe(true);

    const off = await receipt(20_000);
    const bad = await tx((c) => saveReceiptRevision(c, actor, off, { origin: "parse", lineItems: lines(), taxCents: null }));
    expect(bad.reconciliation.balanced).toBe(false);
    expect((await active(off)).every((o) => !o.reconciled)).toBe(true);
  });
});
