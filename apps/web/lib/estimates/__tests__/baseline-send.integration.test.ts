/**
 * Hourly baseline send rules and freeze at send (TASK-194, TASK-188 acceptance).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * Pins the owner account's rates to the formula document's ($85 sell, $50 floor,
 * 15% handling, 10% warning) and restores them afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { quoteStamp } from "./quote-stamp";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

type Line = {
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_item_type: "labor" | "materials" | "equipment";
  unit_cost_cents?: number;
  hours_low?: number | null;
  hours_high?: number | null;
  hours_source?: string | null;
};

const labor = (description: string, low: number | null, high: number | null, priceCents: number): Line => ({
  description,
  quantity: 1,
  unit_price_cents: priceCents,
  line_item_type: "labor",
  hours_low: low,
  hours_high: high,
  hours_source: low == null ? null : "owner",
});

describe.skipIf(!RUN)("hourly baseline send rules", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let clientId = "";
  let accountId = "";
  let ownerId = "";
  let savedSettings: Record<string, unknown> | null = null;

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : {};
    return { status: res.status, data };
  }

  async function db<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    try {
      return (await c.query(sql, params)).rows as T[];
    } finally {
      await c.end();
    }
  }

  async function setRates(patch: Record<string, number>) {
    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`).join(", ");
    await db(`UPDATE business_pricing_settings SET ${sets} WHERE account_id = $1`, [accountId, ...Object.values(patch)]);
  }

  async function create(lines: Line[], extra: Record<string, unknown> = {}): Promise<string> {
    const res = await api("POST", "/api/v1/estimates", { client_id: clientId, line_items: lines, ...extra });
    expect(res.status).toBe(201);
    return res.data.id as string;
  }

  async function confirmCosts(id: string, otherDirectCents = 0) {
    const res = await api("PATCH", `/api/v1/estimates/${id}`, {
      other_direct_cost_cents: otherDirectCents,
      direct_costs_confirmed: true,
    });
    expect(res.status).toBe(200);
  }

  const send = (id: string, body: Record<string, unknown> = {}) =>
    api("POST", `/api/v1/estimates/${id}/send`, { markOnly: true, ...body });

  async function row(id: string) {
    const rows = await db<{
      status: string;
      subtotal_cents: number;
      baseline_snapshot: {
        sell_rate_cents: number;
        warning_pct: number;
        result: {
          complete: boolean;
          baseline: { low: number; mid: number; high: number } | null;
          gapCents: number | null;
          effectiveRateCents: number | null;
          warning: string;
          belowCostFloor: boolean | null;
        };
      } | null;
      direct_costs_confirmed_at: string | null;
      cost_floor_ack_at: string | null;
      cost_floor_ack_by: string | null;
    }>(
      `SELECT status, subtotal_cents, baseline_snapshot, direct_costs_confirmed_at,
              cost_floor_ack_at, cost_floor_ack_by
       FROM estimates WHERE id = $1`,
      [id],
    );
    return rows[0];
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-194-baseline" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Baseline send rules" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
    const ids = await db<{ account_id: string; owner_id: string }>(
      `SELECT c.account_id, u.id AS owner_id FROM clients c
       JOIN users u ON u.account_id = c.account_id AND u.email = 'owner@test.com'
       WHERE c.id = $1`,
      [clientId],
    );
    accountId = ids[0].account_id;
    ownerId = ids[0].owner_id;
    await api("GET", "/api/v1/pricing/settings"); // seeds the row when missing
    savedSettings = (await db<Record<string, unknown>>(
      `SELECT labor_billing_cents_per_hour, labor_cost_cents_per_hour, material_handling_pct, baseline_warning_pct
       FROM business_pricing_settings WHERE account_id = $1`,
      [accountId],
    ))[0];
    await setRates({
      labor_billing_cents_per_hour: 8500,
      labor_cost_cents_per_hour: 5000,
      material_handling_pct: 15,
      baseline_warning_pct: 10,
    });
  });

  afterAll(async () => {
    if (savedSettings && accountId) {
      await setRates(savedSettings as Record<string, number>).catch(() => {});
    }
    if (clientId) {
      await db(`DELETE FROM estimates WHERE client_id = $1`, [clientId]).catch(() => {});
      await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
    }
  });

  it("a labor line without hours saves as a draft, and Send returns 422 naming that line", async () => {
    const id = await create([labor("Patch walls", 10, 12, 93500), labor("Paint trim", null, null, 50000)]);
    await confirmCosts(id);
    const res = await send(id);
    expect(res.status).toBe(422);
    expect(res.data.error.code).toBe("BASELINE_INCOMPLETE");
    expect(res.data.error.details.missing).toEqual([{ kind: "hours", lineIndex: 1 }]);
    expect(res.data.error.details.checklist[0].label).toContain("Paint trim");
    expect(res.data.error.details.checklist[0].href).toBe("#edit-line-hours-1");
    expect((await row(id)).status).toBe("draft");
  });

  it("a flat price needs an estimate-level range; with 20 to 30 h it sends", async () => {
    const id = await create([], { flat_rate_cents: 200000 });
    await confirmCosts(id);
    const blocked = await send(id);
    expect(blocked.status).toBe(422);
    expect(blocked.data.error.details.missing).toEqual([{ kind: "hours" }]);

    const ranged = await api("PATCH", `/api/v1/estimates/${id}`, {
      labor_hours_low: 20,
      labor_hours_high: 30,
      labor_hours_source: "owner",
    });
    expect(ranged.status).toBe(200);
    // Changing hours cleared the confirmation, so it has to be given again.
    expect((await row(id)).direct_costs_confirmed_at).toBeNull();
    await confirmCosts(id);
    expect((await send(id)).status).toBe(200);
    const sent = await row(id);
    expect(sent.status).toBe("sent");
    expect(sent.baseline_snapshot?.result.baseline).toEqual({ low: 170000, mid: 212500, high: 255000 });
  });

  it("Send is refused until other direct costs are confirmed; confirming $0 allows it", async () => {
    const id = await create([labor("Hang doors", 6, 8, 59500)]);
    const blocked = await send(id);
    expect(blocked.status).toBe(422);
    expect(blocked.data.error.details.missing).toEqual([{ kind: "other_direct" }]);
    await confirmCosts(id, 0);
    expect((await send(id)).status).toBe(200);
  });

  it("a materials line without a cost blocks sending", async () => {
    const id = await create([
      labor("Tile", 8, 10, 76500),
      { description: "Grout", quantity: 1, unit_price_cents: 4000, line_item_type: "materials" },
    ]);
    await confirmCosts(id);
    const res = await send(id);
    expect(res.status).toBe(422);
    expect(res.data.error.details.missing).toEqual([{ kind: "cost", lineIndex: 1 }]);
  });

  it("warnings never block: 5% below is a warning, 12% below is strong at 10% and not at 15%", async () => {
    const fivePct = await create([labor("Five below", 10, 10, 80750)]);
    await confirmCosts(fivePct);
    expect((await send(fivePct)).status).toBe(200);
    expect((await row(fivePct)).baseline_snapshot?.result.warning).toBe("below");

    const twelve = await create([labor("Twelve below", 10, 10, 74800)]);
    await confirmCosts(twelve);
    expect((await send(twelve)).status).toBe(200);
    expect((await row(twelve)).baseline_snapshot?.result.warning).toBe("strong");

    await setRates({ baseline_warning_pct: 15 });
    try {
      const twelveAt15 = await create([labor("Twelve below at 15", 10, 10, 74800)]);
      await confirmCosts(twelveAt15);
      expect((await send(twelveAt15)).status).toBe(200);
      const snap = (await row(twelveAt15)).baseline_snapshot;
      expect(snap?.result.warning).toBe("below");
      expect(snap?.warning_pct).toBe(15);
    } finally {
      await setRates({ baseline_warning_pct: 10 });
    }
  });

  it("an effective rate of $45/h needs the acknowledgment, which is stored", async () => {
    const id = await create([labor("Low price", 20, 20, 90000)]);
    await confirmCosts(id);
    const refused = await send(id);
    expect(refused.status).toBe(409);
    expect(refused.data.error.code).toBe("COST_FLOOR_ACK_REQUIRED");
    expect((await row(id)).status).toBe("draft");

    const ok = await send(id, { acknowledgeCostFloor: true });
    expect(ok.status).toBe(200);
    const sent = await row(id);
    expect(sent.status).toBe("sent");
    expect(sent.cost_floor_ack_at).not.toBeNull();
    expect(sent.cost_floor_ack_by).toBe(ownerId);
    expect(sent.baseline_snapshot?.result.effectiveRateCents).toBe(4500);
    expect(sent.baseline_snapshot?.result.belowCostFloor).toBe(true);
  });

  it("handling on adds 15% of materials cost; the effective rate never subtracts it", async () => {
    const lines: Line[] = [
      labor("Install vanity", 10, 14, 102000),
      { description: "Vanity", quantity: 1, unit_price_cents: 10000, unit_cost_cents: 10000, line_item_type: "materials" },
    ];
    const off = await create(lines);
    await confirmCosts(off);
    expect((await send(off)).status).toBe(200);
    const on = await create(lines);
    expect((await api("PATCH", `/api/v1/estimates/${on}`, { handling_in_baseline: true })).status).toBe(200);
    await confirmCosts(on);
    expect((await send(on)).status).toBe(200);

    const offSnap = (await row(off)).baseline_snapshot!.result;
    const onSnap = (await row(on)).baseline_snapshot!.result;
    expect(offSnap.baseline?.mid).toBe(112000);
    expect(onSnap.baseline?.mid).toBe(113500);
    expect(onSnap.effectiveRateCents).toBe(offSnap.effectiveRateCents);
  });

  it("after send, a billing-rate change leaves the frozen baseline alone; send never changes price", async () => {
    const id = await create([labor("Frozen", 10, 10, 85000)]);
    await confirmCosts(id);
    const before = await row(id);
    expect((await send(id)).status).toBe(200);
    const sent = await row(id);
    expect(sent.subtotal_cents).toBe(before.subtotal_cents);
    expect(sent.baseline_snapshot?.sell_rate_cents).toBe(8500);

    await setRates({ labor_billing_cents_per_hour: 10000 });
    try {
      const after = await row(id);
      expect(after.baseline_snapshot).toEqual(sent.baseline_snapshot);
      const lines = await db<{ unit_price_cents: number }>(
        `SELECT unit_price_cents FROM estimate_line_items WHERE estimate_id = $1`,
        [id],
      );
      expect(lines.map((l) => l.unit_price_cents)).toEqual([85000]);
    } finally {
      await setRates({ labor_billing_cents_per_hour: 8500 });
    }
  });

  it("an edit to the lines clears the confirmation and acknowledgment; a notes-only save keeps them", async () => {
    const id = await create([labor("Edits", 20, 20, 90000)]);
    await confirmCosts(id);
    await db(`UPDATE estimates SET cost_floor_ack_at = now(), cost_floor_ack_by = $2 WHERE id = $1`, [id, ownerId]);

    expect((await api("PATCH", `/api/v1/estimates/${id}`, { notes: "Just a note" })).status).toBe(200);
    let r = await row(id);
    expect(r.direct_costs_confirmed_at).not.toBeNull();
    expect(r.cost_floor_ack_at).not.toBeNull();

    const edited = await api("PATCH", `/api/v1/estimates/${id}`, {
      line_items: [labor("Edits", 20, 22, 90000)],
      updated_at: await quoteStamp(id),
    });
    expect(edited.status).toBe(200);
    r = await row(id);
    expect(r.direct_costs_confirmed_at).toBeNull();
    expect(r.cost_floor_ack_at).toBeNull();
    expect(r.cost_floor_ack_by).toBeNull();

    // Same lines saved again (the edit form always sends them): nothing to clear.
    await confirmCosts(id);
    const same = await api("PATCH", `/api/v1/estimates/${id}`, {
      line_items: [labor("Edits", 20, 22, 90000)],
      notes: "Saved again",
      updated_at: await quoteStamp(id),
    });
    expect(same.status).toBe(200);
    expect((await row(id)).direct_costs_confirmed_at).not.toBeNull();
  });

  it("an existing draft with no hours lists them; after filling them in, it sends", async () => {
    const id = await create([labor("Old line A", null, null, 40000), labor("Old line B", null, null, 40000)]);
    const blocked = await send(id);
    expect(blocked.status).toBe(422);
    expect(blocked.data.error.details.checklist.map((c: { href: string }) => c.href)).toEqual([
      "#edit-line-hours-0",
      "#edit-line-hours-1",
      "#baseline-other-direct",
    ]);
    const filled = await api("PATCH", `/api/v1/estimates/${id}`, {
      line_items: [labor("Old line A", 3, 4, 40000), labor("Old line B", 3, 4, 40000)],
      updated_at: await quoteStamp(id),
    });
    expect(filled.status).toBe(200);
    await confirmCosts(id);
    expect((await send(id)).status).toBe(200);
  });

  it("an option quote is not blocked by the new rules and gets no combined baseline", async () => {
    const id = await create([], {
      presentation_mode: "multi_option",
      options: [
        { label: "Good", sort_order: 0, is_recommended: false, line_items: [labor("Good", null, null, 60000)] },
        { label: "Best", sort_order: 1, is_recommended: true, line_items: [labor("Best", null, null, 90000)] },
      ],
    });
    const res = await send(id);
    expect(res.status).toBe(200);
    expect((await row(id)).baseline_snapshot).toBeNull();
  });

  it("resending a quote sent before this change is not blocked", async () => {
    const id = await create([labor("Sent long ago", null, null, 60000)]);
    await db(`UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1`, [id]);
    const res = await send(id);
    expect(res.status).toBe(200);
    expect((await row(id)).baseline_snapshot).toBeNull();
  });
});
