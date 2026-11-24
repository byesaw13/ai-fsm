/**
 * Store purchase imports against Postgres: both modes, review records, atomic
 * confirmation (TASK-211; docs/working/estimating-assistant-phase3.md §3).
 *
 * Tier: database + HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * CI applies migrations, including 215, before this file runs.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool, type PoolClient } from "pg";
import { importTrips, type Actor, type ImportTrip } from "../import/run";
import { confirmReview, createReview, dismissReview, pendingSummary, reopenReview } from "../import/reviews";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("store purchase imports", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  const tag = `it211${Date.now()}`;
  const store = String(Date.now() % 1_000_000);
  let pool: Pool;
  let actor: Actor;
  let cookie = "";
  let seq = 0;

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
  const count = async (sql: string, params: unknown[] = []) => Number((await q<{ n: string }>(sql, params))[0].n);

  /** A trip with unique transaction, SKUs and names for this run. */
  function trip(over: Partial<ImportTrip> = {}): ImportTrip {
    seq += 1;
    const txn = `${tag}-${seq}`;
    // A distinct total per trip, so one test's receipt is never another trip's look-alike.
    const paint = 4000 + seq * 13;
    return {
      trip_key: `${store}:${txn}`,
      external_ref: txn,
      store_number: store,
      date: "2026-03-15",
      vendor: "The Home Depot",
      amount_cents: 2 * 997 + paint,
      expense_category: "materials",
      line_items: [
        { sku: `${tag}-S1`, name: `${tag} Screws`, category: "fasteners", unit_cost_cents: 997, quantity: 1, discounted: false },
        { sku: `${tag}-S1`, name: `${tag} Screws`, category: "fasteners", unit_cost_cents: 997, quantity: 1, discounted: false },
        { sku: `${tag}-P${seq}`, name: `${tag} Paint ${seq}`, category: "paint", unit_cost_cents: paint, quantity: 1, discounted: false },
      ],
      ...over,
    };
  }

  const run = (mode: "history" | "book", trips: ImportTrip[]) =>
    tx((c) => importTrips(c, actor, { mode, source: "home_depot_csv", trips }));

  const expensesFor = (t: ImportTrip) =>
    count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1 AND external_ref LIKE $2`, [actor.accountId, `${t.external_ref}%`]);
  const observationsFor = (t: ImportTrip) =>
    count(`SELECT count(*) AS n FROM price_observations WHERE account_id = $1 AND dedupe_key LIKE $2`, [
      actor.accountId,
      `txn:home_depot:${store}:${t.external_ref!.toLowerCase().replace(/[^a-z0-9]/g, "")}:%`,
    ]);
  const cacheSnapshot = () =>
    q(`SELECT id, unit_cost_cents, avg_paid_cents, purchase_count, last_purchased_at::text
       FROM materials_price_book WHERE account_id = $1 AND name LIKE $2 ORDER BY id`, [actor.accountId, `${tag}%`]);

  async function receipt(amountCents: number, externalRef: string | null = null): Promise<string> {
    const rows = await q<{ id: string }>(
      `INSERT INTO expenses (account_id, vendor_name, category, amount_cents, expense_date, notes, external_ref, created_by)
       VALUES ($1, 'Home Depot', 'materials', $2, '2026-03-15', $3, $4, $5) RETURNING id`,
      [actor.accountId, amountCents, `${tag} receipt`, externalRef, actor.userId],
    );
    return rows[0].id;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const owner = (await q<{ id: string; account_id: string }>(`SELECT id, account_id FROM users WHERE email = 'owner@test.com'`))[0];
    actor = { accountId: owner.account_id, userId: owner.id };
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-211" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM purchase_import_reviews WHERE account_id = $1 AND payload->'trip'->>'store_number' = $2`, [actor.accountId, store]);
    await pool.query(`DELETE FROM expenses WHERE account_id = $1 AND (store_number = $2 OR notes LIKE $3)`, [actor.accountId, store, `${tag}%`]);
    await pool.query(`DELETE FROM materials_price_book WHERE account_id = $1 AND name LIKE $2`, [actor.accountId, `${tag}%`]);
    await pool.end();
  });

  it("history import books no expenses and leaves job cost unchanged", async () => {
    const t = trip();
    const expensesBefore = await count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1`, [actor.accountId]);
    const report = await run("history", [t]);
    expect(report).toMatchObject({ mode: "history", imported: 1, observations: 3 });
    expect(await count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1`, [actor.accountId])).toBe(expensesBefore);
    // Two identical lines in one transaction both count.
    const screws = (await q<{ purchase_count: number }>(
      `SELECT purchase_count FROM materials_price_book WHERE account_id = $1 AND sku = $2`, [actor.accountId, `${tag}-S1`],
    ))[0];
    expect(screws.purchase_count).toBeGreaterThanOrEqual(2);
  });

  it("history then book import of one transaction adds expenses but no new observations", async () => {
    const t = trip();
    await run("history", [t]);
    expect(await observationsFor(t)).toBe(3);
    const report = await run("book", [t]);
    expect(report).toMatchObject({ imported: 1, observations: 0 });
    expect(await expensesFor(t)).toBe(1);
    expect(await count(
      `SELECT count(*) AS n FROM expense_line_items li JOIN expenses e ON e.id = li.expense_id WHERE e.external_ref = $1 AND e.account_id = $2`,
      [t.external_ref, actor.accountId],
    )).toBe(3);
    expect(await observationsFor(t)).toBe(3);
    // And a third time, in either mode: nothing.
    expect(await run("book", [t])).toMatchObject({ imported: 0, alreadyImported: 1, observations: 0 });
    expect(await run("history", [t])).toMatchObject({ imported: 0, alreadyImported: 1, observations: 0 });
  });

  it("re-import at a fixed evaluation date leaves observations and the cache unchanged", async () => {
    const trips = [trip(), trip({ date: "2026-03-16" })];
    await run("history", trips);
    const before = { cache: await cacheSnapshot(), obs: await observationsFor(trips[0]) + await observationsFor(trips[1]) };
    const again = await run("history", trips);
    expect(again).toMatchObject({ imported: 0, alreadyImported: 2, observations: 0 });
    expect(await cacheSnapshot()).toEqual(before.cache);
    expect(await observationsFor(trips[0]) + await observationsFor(trips[1])).toBe(before.obs);
  });

  it("re-import does not duplicate a pending review, and a pending trip adds nothing", async () => {
    const t = trip();
    await receipt(t.amount_cents); // a look-alike photo: same store family, date and total, no transaction id
    const expensesBefore = await count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1`, [actor.accountId]);
    const first = await run("book", [t]);
    expect(first).toMatchObject({ pending: 1, imported: 0, observations: 0 });
    const second = await run("book", [t]);
    expect(second).toMatchObject({ pending: 1, imported: 0, observations: 0 });
    expect(await count(
      `SELECT count(*) AS n FROM purchase_import_reviews WHERE account_id = $1 AND identity_key LIKE $2`,
      [actor.accountId, `%:${t.external_ref!.toLowerCase().replace(/[^a-z0-9]/g, "")}`],
    )).toBe(1);
    expect(await count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1`, [actor.accountId])).toBe(expensesBefore);
    expect(await observationsFor(t)).toBe(0);
    const summary = await tx((c) => pendingSummary(c, actor.accountId));
    expect(summary.count).toBeGreaterThanOrEqual(1);
    expect(summary.valueCents).toBeGreaterThanOrEqual(t.amount_cents);
  });

  it("history mode holds a possible duplicate out of price evidence until confirmed different", async () => {
    const t = trip();
    await receipt(t.amount_cents);
    expect(await run("history", [t])).toMatchObject({ pending: 1, observations: 0 });
    expect(await observationsFor(t)).toBe(0);
    const id = (await q<{ id: string }>(
      `SELECT id FROM purchase_import_reviews WHERE account_id = $1 AND mode = 'history' AND payload->'trip'->>'external_ref' = $2`,
      [actor.accountId, t.external_ref],
    ))[0].id;
    const before = await count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1`, [actor.accountId]);
    await tx((c) => confirmReview(c, actor, id, "different"));
    expect(await observationsFor(t)).toBe(3);
    expect(await count(`SELECT count(*) AS n FROM expenses WHERE account_id = $1`, [actor.accountId])).toBe(before);
  });

  it("confirm with a forced failure leaves the review pending and nothing booked", async () => {
    const t = trip();
    // The second line overflows expense_line_items.quantity after the expense row is written.
    const broken = { ...t, line_items: [t.line_items[0], { ...t.line_items[2], quantity: 1e10 }] };
    const { id } = await tx((c) =>
      createReview(c, actor, {
        mode: "book",
        identityKey: `${tag}-forced`,
        reason: "possible_duplicate",
        payload: { source: "home_depot_csv", trip: broken },
        valueCents: t.amount_cents,
      }),
    );
    await expect(tx((c) => confirmReview(c, actor, id, "different"))).rejects.toThrow();
    const row = (await q<{ status: string; expense_id: string | null }>(
      `SELECT status, expense_id FROM purchase_import_reviews WHERE id = $1`, [id],
    ))[0];
    expect(row).toEqual({ status: "pending", expense_id: null });
    expect(await expensesFor(t)).toBe(0);
    expect(await observationsFor(t)).toBe(0);
  });

  it("confirming same attaches the trip to the receipt instead of booking it twice", async () => {
    const t = trip();
    const receiptId = await receipt(t.amount_cents);
    await run("book", [t]);
    const id = (await q<{ id: string }>(
      `SELECT id FROM purchase_import_reviews WHERE account_id = $1 AND mode = 'book' AND payload->'trip'->>'external_ref' = $2`,
      [actor.accountId, t.external_ref],
    ))[0].id;
    await tx((c) => confirmReview(c, actor, id, "same"));
    const linked = (await q<{ external_ref: string; store_number: string; source: string }>(
      `SELECT external_ref, store_number, source FROM expenses WHERE id = $1`, [receiptId],
    ))[0];
    expect(linked).toEqual({ external_ref: t.external_ref, store_number: store, source: "home_depot_csv" });
    expect(await expensesFor(t)).toBe(1);
    // Re-importing the file now finds the trip already imported.
    expect(await run("book", [t])).toMatchObject({ alreadyImported: 1, imported: 0, pending: 0 });
  });

  it("a dismissed review is excluded from evidence and costs; reopen returns it to pending; both are logged", async () => {
    const t = trip();
    await receipt(t.amount_cents);
    await run("book", [t]);
    const id = (await q<{ id: string }>(
      `SELECT id FROM purchase_import_reviews WHERE account_id = $1 AND mode = 'book' AND payload->'trip'->>'external_ref' = $2`,
      [actor.accountId, t.external_ref],
    ))[0].id;
    await tx((c) => dismissReview(c, actor, id, "Personal purchase"));
    expect((await q<{ status: string; dismiss_reason: string }>(
      `SELECT status, dismiss_reason FROM purchase_import_reviews WHERE id = $1`, [id],
    ))[0]).toEqual({ status: "dismissed", dismiss_reason: "Personal purchase" });
    // Re-importing keeps it dismissed: no new record, nothing booked or priced.
    expect(await run("book", [t])).toMatchObject({ pending: 0, imported: 0, observations: 0 });
    expect(await expensesFor(t)).toBe(0);
    expect(await observationsFor(t)).toBe(0);

    await tx((c) => reopenReview(c, actor, id));
    expect((await q<{ status: string; dismiss_reason: string | null }>(
      `SELECT status, dismiss_reason FROM purchase_import_reviews WHERE id = $1`, [id],
    ))[0]).toEqual({ status: "pending", dismiss_reason: null });
    const log = await q<{ new_value: { status: string } }>(
      `SELECT new_value FROM audit_log WHERE entity_type = 'purchase_import_review' AND entity_id = $1 ORDER BY created_at`, [id],
    );
    expect(log.map((l) => l.new_value.status)).toEqual(["dismissed", "pending"]);
  });

  it("the preview route reports skipped rows, plans and the pending count", async () => {
    const csv = [
      "Date,Store Number,Transaction ID,SKU Number,SKU Description,Quantity,Department Name,Net Unit Price",
      `2026-03-17,${store},${tag}-http,${tag}-H1,${tag} Hinge,2,HARDWARE,$4.50`,
      `2026-03-17,${store},${tag}-http,${tag}-H2,${tag} Return,1,HARDWARE,-$1.00`,
      `bad,${store},${tag}-http,${tag}-H3,${tag} Bad date,1,HARDWARE,$1.00`,
    ].join("\n");
    const fd = new FormData();
    fd.append("file", new Blob([csv], { type: "text/csv" }), "hd.csv");
    fd.append("mode", "history");
    const res = await fetch(`${BASE_URL}/api/v1/expenses/import/preview`, { method: "POST", headers: { cookie }, body: fd });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.summary.mode).toBe("history");
    expect(json.data.summary.skipped_rows.map((r: { reason: string }) => r.reason).sort()).toEqual(["bad_date", "return"]);
    expect(json.data.transactions[0].plan).toEqual({ action: "import" });
    expect(typeof json.data.summary.pending.count).toBe("number");

    const list = await fetch(`${BASE_URL}/api/v1/expenses/import/reviews`, { headers: { cookie } });
    expect(list.status).toBe(200);
  });
});
