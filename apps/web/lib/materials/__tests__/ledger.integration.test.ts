/**
 * Price observation ledger against Postgres (TASK-210).
 *
 * Tier: database + HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * CI applies migrations, including 214, before this file runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, type PoolClient } from "pg";
import { findOrCreateVariant, recordObservations, replaceSourceObservations, type NewObservation } from "../ledger";
import { backfillPriceObservations } from "../backfill";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("price observation ledger", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const tag = `it210-${Date.now()}`;
  let pool: Pool;
  let accountId = "";
  let cookie = "";

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

  const obs = (variantId: string, over: Partial<NewObservation>): NewObservation => ({
    variantId,
    kind: "receipt",
    observedOn: "2026-06-01",
    unitPriceCents: 1000,
    storeFamily: "home_depot",
    sourceRef: `${tag}:src`,
    dedupeKey: `${tag}:${Math.random().toString(36).slice(2)}`,
    ...over,
  });

  const variantRow = async (id: string) =>
    (await q<{ unit_cost_cents: number; avg_paid_cents: number | null; purchase_count: number; last_purchased_at: string | null }>(
      `SELECT unit_cost_cents, avg_paid_cents, purchase_count, last_purchased_at::text AS last_purchased_at
       FROM materials_price_book WHERE id = $1`,
      [id],
    ))[0];

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    accountId = (await q<{ account_id: string }>(`SELECT account_id FROM users WHERE email = 'owner@test.com'`))[0].account_id;
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-210" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM materials_price_book WHERE account_id = $1 AND name LIKE $2`, [accountId, `${tag}%`]);
    await pool.end();
  });

  it("the same SKU at Home Depot and Lowe's is two variants", async () => {
    const [hd, lowes] = await tx(async (c) => [
      await findOrCreateVariant(c, accountId, { name: `${tag} Caulk`, sku: `${tag}-SKU`, supplier: "The Home Depot" }),
      await findOrCreateVariant(c, accountId, { name: `${tag} Caulk`, sku: `${tag}-SKU`, supplier: "Lowe's" }),
    ]);
    expect(hd!.id).not.toBe(lowes!.id);
    expect(hd!.storeFamily).toBe("home_depot");
    expect(lowes!.storeFamily).toBe("lowes");
    const again = await tx((c) => findOrCreateVariant(c, accountId, { name: "anything", sku: `${tag}-SKU`, supplier: "Home Depot" }));
    expect(again!.id).toBe(hd!.id);
  });

  it("a store-suffixed variant without a SKU is reused on the next purchase", async () => {
    const first = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Tape`, supplier: "Home Depot" }));
    const lowes1 = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Tape`, supplier: "Lowe's" }));
    const lowes2 = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Tape`, supplier: "Lowe's" }));
    expect(lowes1!.id).not.toBe(first!.id);
    expect(lowes2!.id).toBe(lowes1!.id);
  });

  it("a receipt correction that removes the only line clears the purchase", async () => {
    const v = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Hinge`, sku: `${tag}-H`, supplier: "Home Depot" }));
    await tx((c) => replaceSourceObservations(c, accountId, `${tag}:receipt`, [obs(v!.id, { sourceRef: `${tag}:receipt`, dedupeKey: `${tag}:hinge` })]));
    expect((await variantRow(v!.id)).purchase_count).toBe(1);
    await tx((c) => replaceSourceObservations(c, accountId, `${tag}:receipt`, []));
    expect(await variantRow(v!.id)).toEqual({ unit_cost_cents: 0, avg_paid_cents: null, purchase_count: 0, last_purchased_at: null });
  });

  it("concurrent recordObservations on one variant leave a consistent cache", async () => {
    const v = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Roller`, sku: `${tag}-R`, supplier: "Home Depot" }));
    const batch = (prices: number[]) =>
      tx((c) => recordObservations(c, accountId, prices.map((p, i) => obs(v!.id, { unitPriceCents: p, observedOn: `2026-06-0${i + 1}` }))));
    await Promise.all([batch([1000, 1200]), batch([1400, 1600])]);
    const row = await variantRow(v!.id);
    expect(row.purchase_count).toBe(4);
    expect(row.avg_paid_cents).toBe(1300);
  });

  it("a duplicate key adds nothing", async () => {
    const v = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Duct tape`, sku: `${tag}-T`, supplier: "Home Depot" }));
    const one = obs(v!.id, { dedupeKey: `${tag}:fixed` });
    const first = await tx((c) => recordObservations(c, accountId, [one]));
    const second = await tx((c) => recordObservations(c, accountId, [one]));
    expect(first).toEqual({ inserted: 1, duplicates: 0 });
    expect(second).toEqual({ inserted: 0, duplicates: 1 });
  });

  it("5b: a CSV row dated before the summary does not displace it; one on or after does", async () => {
    const v = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Primer`, sku: `${tag}-P`, supplier: "Home Depot" }));
    await tx((c) => recordObservations(c, accountId, [obs(v!.id, { kind: "catalog_summary", unitPriceCents: 2500, observedOn: "2026-05-01" })]));
    await tx((c) => recordObservations(c, accountId, [obs(v!.id, { kind: "supplier_csv", unitPriceCents: 2200, observedOn: "2026-04-01" })]));
    let row = await variantRow(v!.id);
    expect(row.unit_cost_cents).toBe(2500);
    expect(row.purchase_count).toBe(1);
    await tx((c) => recordObservations(c, accountId, [obs(v!.id, { kind: "supplier_csv", unitPriceCents: 2600, observedOn: "2026-05-01" })]));
    row = await variantRow(v!.id);
    expect(row.unit_cost_cents).toBe(2600);
    const status = await q<{ status: string }>(
      `SELECT status FROM price_observations WHERE variant_id = $1 AND kind = 'catalog_summary'`,
      [v!.id],
    );
    expect(status[0].status).toBe("superseded");
  });

  it("2c: editing a catalog price without an observed price and source is refused", async () => {
    const v = await tx((c) => findOrCreateVariant(c, accountId, { name: `${tag} Brush`, sku: `${tag}-B`, supplier: "Home Depot" }));
    const patch = (body: unknown) =>
      fetch(`${BASE_URL}/api/v1/materials/${v!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      });
    expect((await patch({ unit_cost_cents: 999 })).status).toBe(422);
    expect((await patch({ observed_price_cents: 999 })).status).toBe(422);
    const ok = await patch({ observed_price_cents: 999, observed_source: "Home Depot shelf" });
    expect(ok.status).toBe(200);
    const row = await variantRow(v!.id);
    expect(row.unit_cost_cents).toBe(999);
    expect(row.purchase_count).toBe(0);
    const ledger = await q<{ kind: string; note: string }>(`SELECT kind, note FROM price_observations WHERE variant_id = $1`, [v!.id]);
    expect(ledger).toEqual([{ kind: "manual_check", note: "Home Depot shelf" }]);
  });

  it("the backfill run twice gives the same ledger and cache", async () => {
    const run = async () => tx((c) => backfillPriceObservations(c, accountId, tag));
    const snapshot = async () => ({
      ledger: await q(
        `SELECT variant_id, kind, observed_on::text, unit_price_cents, status, dedupe_key
         FROM price_observations WHERE account_id = $1 ORDER BY dedupe_key`,
        [accountId],
      ),
      cache: await q(
        `SELECT id, unit_cost_cents, avg_paid_cents, purchase_count, last_purchased_at::text
         FROM materials_price_book WHERE account_id = $1 ORDER BY id`,
        [accountId],
      ),
    });
    const first = await run();
    const afterFirst = await snapshot();
    const second = await run();
    const afterSecond = await snapshot();
    expect(second.summaries.inserted).toBe(0);
    expect(second.receipts.inserted).toBe(0);
    expect(afterSecond).toEqual(afterFirst);
    expect(first.summaries.candidates).toBeGreaterThan(0);
    // Summaries are never counted as purchases.
    const counted = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM materials_price_book m
       WHERE m.account_id = $1 AND m.purchase_count > (
         SELECT count(*) FROM price_observations o
         WHERE o.variant_id = m.id AND o.kind IN ('receipt', 'supplier_csv') AND o.status = 'active' AND NOT o.is_sale)`,
      [accountId],
    );
    expect(counted[0].n).toBe("0");
  });
});
