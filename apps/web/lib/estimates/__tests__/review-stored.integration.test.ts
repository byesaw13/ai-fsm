/**
 * Estimate review runs on the button only and is stored (TASK-195).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * CI has no ANTHROPIC_API_KEY, so the route uses the rule-based review, which
 * reads the same input the AI review gets.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import type { PreparedScope } from "@ai-fsm/domain";
import { quoteStamp } from "./quote-stamp";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("estimate review is stored and never runs on page open", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let techCookie = "";
  let clientId = "";
  let estimateId = "";

  async function login(email: string, ip: string) {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "password" }),
    });
    const c = res.headers.get("set-cookie") ?? "";
    if (!c) throw new Error(`login failed for ${email}: ${res.status}`);
    return c;
  }

  async function api(method: string, path: string, body?: unknown, as = cookie) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: as },
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

  const reviewRow = async () =>
    (await db<{ review_result: { source: string; reviewed_at: string; result: { suggestions: { message: string; suggestion: string }[] } } | null; current: boolean }>(
      `SELECT review_result,
              date_trunc('milliseconds', review_for_updated_at) = date_trunc('milliseconds', updated_at) AS current
       FROM estimates WHERE id = $1`,
      [estimateId],
    ))[0];

  beforeAll(async () => {
    cookie = await login("owner@test.com", "it-task-195-owner");
    techCookie = await login("tech@test.com", "it-task-195-tech");
    clientId = (await api("POST", "/api/v1/clients", { name: "Review stored" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");

    // Fixture A, prepared and applied: Pantry, Kitchen, Hall and Foyer have hours and no paint priced.
    const areas = [
      ["protection", "Protection, setup and general prep", 9, 16, 30000],
      ["bedroom", "Bedroom", 13.25, 20.25, 29500],
      ["pantry", "Pantry", 2, 3, null],
      ["kitchen", "Kitchen", 8, 12, null],
      ["office", "Office", 7.5, 10.25, 22500],
      ["hall", "Hall", 7, 10, null],
      ["foyer", "Foyer", 12, 20, null],
      ["living", "Living room", 29, 40.75, 63000],
    ] as const;
    const scope: PreparedScope = {
      version: 1,
      source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
      groups: areas.map(([key, label]) => ({ key, label })),
      tasks: areas.map(([key, label, low, high, materials]) => ({
        id: key,
        room_id: null,
        description: label,
        kind: "requested" as const,
        confirmed: true,
        group_key: key,
        quantity_key: null,
        count: null,
        quantity: null,
        hours_low: low,
        hours_high: high,
        hours_source: "ai_allowance" as const,
        materials_cents: materials,
      })),
      questions: [],
      alternatives: [],
      exclusions: [],
    };
    const created = await api("POST", "/api/v1/estimates", { client_id: clientId, line_items: [] });
    if (created.status !== 201) throw new Error(`estimate create failed: ${created.status}`);
    estimateId = created.data.id;
    await db(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(scope), estimateId]);
    const applied = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: scope,
      apply: true,
      updated_at: await quoteStamp(estimateId),
    });
    if (applied.status !== 200) throw new Error(`apply failed: ${applied.status}`);
  });

  afterAll(async () => {
    if (clientId) {
      await db(`DELETE FROM estimates WHERE client_id = $1`, [clientId]).catch(() => {});
      await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
    }
  });

  it("opening the estimate page runs no review", async () => {
    const page = await fetch(`${BASE_URL}/app/estimates/${estimateId}`, { headers: { Cookie: cookie } });
    expect(page.status).toBe(200);
    expect((await reviewRow()).review_result).toBeNull();
  });

  it("the review names the areas with hours and no materials price, never square footage, and is stored as current", async () => {
    const res = await api("POST", `/api/v1/estimates/${estimateId}/review`);
    expect(res.status).toBe(200);
    expect(res.data.stored).toBe(true);
    const text = res.data.review.result.suggestions
      .map((s: { message: string; suggestion: string }) => `${s.message} ${s.suggestion}`)
      .join(" ");
    for (const area of ["Pantry", "Kitchen", "Hall", "Foyer"]) expect(text).toContain(area);
    expect(text).not.toMatch(/square f|sq ft/i);

    const row = await reviewRow();
    expect(row.review_result?.source).toBe("rules");
    expect(row.current).toBe(true);
    expect(res.data.updated_at).toBeTruthy();
  });

  it("a second open with no edits keeps the stored review and runs nothing", async () => {
    const before = await reviewRow();
    const page = await fetch(`${BASE_URL}/app/estimates/${estimateId}`, { headers: { Cookie: cookie } });
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("hours but no materials price");
    const after = await reviewRow();
    expect(after.review_result?.reviewed_at).toBe(before.review_result?.reviewed_at);
    expect(after.current).toBe(true);
  });

  it("an edit makes the stored review out of date", async () => {
    expect((await api("PATCH", `/api/v1/estimates/${estimateId}`, { notes: "Changed after the review" })).status).toBe(200);
    expect((await reviewRow()).current).toBe(false);
  });

  it("a tech cannot run a review", async () => {
    expect((await api("POST", `/api/v1/estimates/${estimateId}/review`, undefined, techCookie)).status).toBe(403);
  });

  it("an option estimate's review reads each option's own lines", async () => {
    const opt = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      presentation_mode: "multi_option",
      options: [
        { label: "Good", sort_order: 0, is_recommended: false, line_items: [{ description: "Patch walls", quantity: 1, unit_price_cents: 60000, line_item_type: "labor" }] },
        { label: "Best", sort_order: 1, is_recommended: true, line_items: [{ description: "Patch and skim walls", quantity: 1, unit_price_cents: 90000, line_item_type: "labor", hours_low: 8, hours_high: 10, hours_source: "owner" }] },
      ],
    });
    expect(opt.status).toBe(201);
    const res = await api("POST", `/api/v1/estimates/${opt.data.id}/review`);
    expect(res.status).toBe(200);
    const text = res.data.review.result.suggestions.map((s: { message: string }) => s.message).join(" ");
    expect(text).toContain("Patch walls (Good)");
    expect(res.data.review.result.summary).not.toContain("No problems");
  });

  it("an approved estimate is not reviewed", async () => {
    const other = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [{ description: "Done deal", quantity: 1, unit_price_cents: 50000, line_item_type: "labor" }],
    });
    await db(`UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1`, [other.data.id]);
    await db(`UPDATE estimates SET status = 'approved' WHERE id = $1`, [other.data.id]);
    expect((await api("POST", `/api/v1/estimates/${other.data.id}/review`)).status).toBe(409);
  });
});
