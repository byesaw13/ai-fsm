/**
 * A stale quote page cannot overwrite a newer save (TASK-222).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * Two saves that loaded the same updated_at: the second returns 409 and the
 * row stays as the first save left it. A later save from the returned
 * timestamp works. A write from outside the page does the same.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import type { PreparedScope } from "@ai-fsm/domain";
import { STALE_QUOTE_MESSAGE } from "../quote-version";
import { quoteStamp } from "./quote-stamp";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("stale quote save guard", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let cookie = "";
  let clientId = "";
  let estimateId = "";

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

  const scope: PreparedScope = {
    version: 1,
    source: { visit_id: "00000000-0000-0000-0000-000000000000", assessment_id: null, assessment_updated_at: null },
    groups: [{ key: "office", label: "Office" }],
    tasks: [
      {
        id: "t1", room_id: null, description: "Paint office", kind: "requested", confirmed: true, group_key: "office",
        quantity_key: null, count: null, quantity: null,
        hours_low: 4, hours_high: 6, hours_source: "ai_allowance", materials_cents: 2000,
      },
    ],
    questions: [{ id: "q1", task_ids: ["t1"], text: "Color?", answer: "White" }],
    alternatives: [],
    exclusions: [],
  };

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-quote-version" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Stale quote guard" })).data?.data?.id;
    estimateId = (await api("POST", "/api/v1/estimates", { client_id: clientId, line_items: [] })).data?.id;
    await db(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(scope), estimateId]);
  });

  afterAll(async () => {
    if (clientId) await db(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
  });

  async function storedHours(): Promise<number | null> {
    const [row] = await db<{ prepared_scope: PreparedScope }>(
      `SELECT prepared_scope FROM estimates WHERE id = $1`,
      [estimateId],
    );
    return row.prepared_scope.tasks[0].hours_high;
  }

  it("the second save with the loaded timestamp returns 409 and keeps the first save", async () => {
    const loaded = await quoteStamp(estimateId);
    const first = structuredClone(scope);
    first.tasks[0].hours_high = 8;
    const saved = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: first,
      updated_at: loaded,
    });
    expect(saved.status).toBe(200);
    expect(saved.data.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const stale = structuredClone(scope);
    stale.tasks[0].hours_high = 3;
    stale.questions[0].answer = null;
    const rejected = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: stale,
      updated_at: loaded,
    });
    expect(rejected.status).toBe(409);
    expect(rejected.data.error.message).toBe(STALE_QUOTE_MESSAGE);
    expect(await storedHours()).toBe(8);

    const again = structuredClone(first);
    again.tasks[0].hours_high = 9;
    const second = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: again,
      updated_at: saved.data.updated_at,
    });
    expect(second.status).toBe(200);
    expect(await storedHours()).toBe(9);
  });

  it("Apply and the edit form refuse the timestamp from before the other save", async () => {
    const loaded = await quoteStamp(estimateId);
    const applied = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: scope,
      apply: true,
      updated_at: loaded,
    });
    expect(applied.status).toBe(200);

    const staleApply = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: scope,
      apply: true,
      updated_at: loaded,
    });
    expect(staleApply.status).toBe(409);
    expect(staleApply.data.error.message).toBe(STALE_QUOTE_MESSAGE);

    const lines = await db<{ description: string }>(
      `SELECT description FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order`,
      [estimateId],
    );
    const staleEdit = await api("PATCH", `/api/v1/estimates/${estimateId}`, {
      tax_rate: 0,
      updated_at: loaded,
      line_items: [{ description: "Old line from the other tab", quantity: 1, unit_price_cents: 100 }],
    });
    expect(staleEdit.status).toBe(409);
    const after = await db<{ description: string }>(
      `SELECT description FROM estimate_line_items WHERE estimate_id = $1 ORDER BY sort_order`,
      [estimateId],
    );
    expect(after).toEqual(lines);

    const fresh = await api("PATCH", `/api/v1/estimates/${estimateId}`, {
      tax_rate: 0,
      updated_at: await quoteStamp(estimateId),
      line_items: [
        ...lines.map((line, i) => ({ description: line.description, quantity: 1, unit_price_cents: 100, sort_order: i })),
      ],
    });
    expect(fresh.status).toBe(200);
  });

  it("a save elsewhere on the same page hands back the timestamp the next quote save needs", async () => {
    const loaded = await quoteStamp(estimateId);
    const notes = await api("PATCH", `/api/v1/estimates/${estimateId}`, { internal_notes: "same tab" });
    expect(notes.status).toBe(200);
    expect(notes.data.updated_at).not.toBe(loaded);

    const saved = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: scope,
      updated_at: notes.data.updated_at,
    });
    expect(saved.status).toBe(200);
  });

  it("a write from outside the page makes the open tab's next save fail", async () => {
    const loaded = await quoteStamp(estimateId);
    await db(`UPDATE estimates SET notes = 'fixed outside the page' WHERE id = $1`, [estimateId]);
    const rejected = await api("PUT", `/api/v1/estimates/${estimateId}/prepared-scope`, {
      prepared_scope: scope,
      updated_at: loaded,
    });
    expect(rejected.status).toBe(409);
    expect(rejected.data.error.message).toBe(STALE_QUOTE_MESSAGE);
    const [row] = await db<{ notes: string }>(`SELECT notes FROM estimates WHERE id = $1`, [estimateId]);
    expect(row.notes).toBe("fixed outside the page");
  });
});
