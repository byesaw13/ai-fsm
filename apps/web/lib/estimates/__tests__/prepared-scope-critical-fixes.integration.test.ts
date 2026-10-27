/**
 * TASK-218 PR 1 regressions: itemized materials no longer crash the print and
 * shopping-list pages; Apply and other line replacements keep a multi-option
 * quote's option lines; a prepared quote cannot be switched to painting or
 * fixed-bid pricing (the double-charge path), while a manual quote still can.
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import type { PreparedScope } from "@ai-fsm/domain";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("TASK-218 critical estimate fixes", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let clientId = "";

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : {};
    return { status: res.status, data };
  }

  async function page(path: string) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: cookie }, redirect: "manual" });
    return { status: res.status, html: await res.text() };
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

  function scope(extra: Partial<PreparedScope> = {}): PreparedScope {
    return {
      version: 1,
      source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
      groups: [{ key: "bath", label: "Bathroom" }],
      tasks: [
        {
          id: "t1", room_id: null, description: "Paint ceiling", kind: "requested", confirmed: true, group_key: "bath",
          quantity_key: null, count: null, quantity: null,
          hours_low: 2, hours_high: 3, hours_source: "ai_allowance", materials_cents: 4000,
        },
      ],
      questions: [],
      alternatives: [],
      exclusions: [],
      ...extra,
    };
  }

  async function preparedDraft(s: PreparedScope, body: Record<string, unknown> = {}) {
    const id = (await api("POST", "/api/v1/estimates", { client_id: clientId, line_items: [], ...body })).data?.id as string;
    await db(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(s), id]);
    return id;
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-218-fixes" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "TASK-218 critical fixes test" })).data?.data?.id;
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  it("itemized materials applied to the quote render on the print and shopping-list pages", async () => {
    const itemized = scope({
      materials: {
        bath: {
          task_ids: ["t1"],
          lines: [{ id: "m1", name: "Ceiling paint, flat white", quantity: 2, unit: "gallon", unit_cost_cents: 4500, source: "your_price", price_book_id: null, notes: "" }],
          customer_supplied: [],
          assumptions: [],
        },
      },
    });
    const id = await preparedDraft(itemized);
    expect((await api("PUT", `/api/v1/estimates/${id}/prepared-scope`, { prepared_scope: itemized, apply: true })).status).toBe(200);

    const print = await page(`/app/estimates/${id}/print`);
    expect(print.status).toBe(200);
    expect(print.html).toContain("Ceiling paint, flat white");
    expect(print.html).not.toContain("undefined —");

    const list = await page(`/app/estimates/${id}/shopping-list`);
    expect(list.status).toBe(200);
    expect(list.html).toContain("Ceiling paint, flat white");
  });

  it("Apply keeps a multi-option quote's option lines and options", async () => {
    const id = await preparedDraft(scope(), {
      presentation_mode: "multi_option",
      options: [
        { label: "Good", is_recommended: false, sort_order: 0, line_items: [{ description: "Good work", quantity: 1, unit_price_cents: 50000, line_item_type: "labor" }] },
        { label: "Better", is_recommended: true, sort_order: 1, line_items: [{ description: "Better work", quantity: 1, unit_price_cents: 80000, line_item_type: "labor" }] },
      ],
    });
    const before = await db<{ description: string }>(
      `SELECT description FROM estimate_line_items WHERE estimate_id = $1 AND option_id IS NOT NULL ORDER BY description`,
      [id],
    );
    expect(before.map((l) => l.description)).toEqual(["Better work", "Good work"]);

    expect((await api("PUT", `/api/v1/estimates/${id}/prepared-scope`, { prepared_scope: scope(), apply: true })).status).toBe(200);

    const after = await db<{ description: string; option_id: string | null; prepared_group_key: string | null }>(
      `SELECT description, option_id, prepared_group_key FROM estimate_line_items WHERE estimate_id = $1 ORDER BY description`,
      [id],
    );
    expect(after.filter((l) => l.option_id).map((l) => l.description)).toEqual(["Better work", "Good work"]);
    expect(after.filter((l) => l.prepared_group_key === "bath")).toHaveLength(2);
    expect(await db(`SELECT id FROM estimate_options WHERE estimate_id = $1`, [id])).toHaveLength(2);
  });

  it("a prepared quote refuses painting and fixed-bid pricing, and its lines are untouched", async () => {
    const id = await preparedDraft(scope());
    await api("PUT", `/api/v1/estimates/${id}/prepared-scope`, { prepared_scope: scope(), apply: true });
    const lines = () => db<{ total_cents: number }>(`SELECT total_cents FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order`, [id]);
    const before = await lines();
    const total = async () => (await db<{ total_cents: number }>(`SELECT total_cents FROM estimates WHERE id = $1`, [id]))[0].total_cents;
    const totalBefore = await total();

    const painting = await api("PATCH", `/api/v1/estimates/${id}`, {
      client_id: clientId, sq_ft: 400, prep_level: 3, includes_trim: false, includes_ceiling: false, labor_hours_estimate: 8,
      line_items: [{ description: "Painting labor", quantity: 1, unit_price_cents: 90000, line_item_type: "labor" }],
    });
    expect(painting.status).toBe(422);
    expect(painting.data.error.code).toBe("PREPARED_SCOPE_PRICING");

    const fixed = await api("PATCH", `/api/v1/estimates/${id}`, { client_id: clientId, flat_rate_cents: 150000, line_items: [] });
    expect(fixed.status).toBe(422);

    expect(await lines()).toEqual(before);
    expect(await total()).toBe(totalBefore);

    // Applying again still yields one set of prepared lines: nothing doubled.
    await api("PUT", `/api/v1/estimates/${id}/prepared-scope`, { prepared_scope: scope(), apply: true });
    expect(await lines()).toEqual(before);
  });

  it("a manual quote can still switch to fixed-bid pricing", async () => {
    const id = (await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [{ description: "Repair", quantity: 1, unit_price_cents: 20000, line_item_type: "labor" }],
    })).data?.id as string;
    const res = await api("PATCH", `/api/v1/estimates/${id}`, { client_id: clientId, flat_rate_cents: 150000, line_items: [] });
    expect(res.status).toBe(200);
    const [est] = await db<{ total_cents: number }>(`SELECT total_cents FROM estimates WHERE id = $1`, [id]);
    expect(est.total_cents).toBeGreaterThanOrEqual(150000);
  });
});
