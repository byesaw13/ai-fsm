/**
 * Production-rate hours keep their snapshot on the labor line (TASK-193 PR 2).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * The snapshot is what makes "changing a rate leaves saved quotes unchanged" auditable:
 * the line keeps the rate value it was priced at.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

const SNAPSHOT = {
  version: 1, hours_per_day: 8, coat_count: 2, default_hours: 0, default_surfaces: [], total_hours: 6,
  parts: [{ surface: "walls", service_code: "5012", rate_id: "r", base_rate: 400, rate_unit: "sqft_per_day",
    rate_calibrated: false, quantity: 302, modifiers: [], hours: 6.04, calibrated: false }],
};

describe.skipIf(!RUN)("production-rate snapshot on create", () => {
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

  async function snapshotOf(estimateId: string) {
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    try {
      const { rows } = await c.query(
        `SELECT hours_source, production_rate_snapshot FROM estimate_line_items WHERE estimate_id = $1`,
        [estimateId],
      );
      return rows[0] as { hours_source: string | null; production_rate_snapshot: unknown };
    } finally {
      await c.end();
    }
  }

  async function create(line: Record<string, unknown>) {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      line_items: [{ description: "Painting labor", quantity: 1, unit_price_cents: 60000, line_item_type: "labor", ...line }],
    });
    expect(res.status).toBe(201);
    return res.data.id as string;
  }

  beforeAll(async () => {
    const login = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "it-task-193-pr2" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = login.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed: ${login.status}`);
    clientId = (await api("POST", "/api/v1/clients", { name: "Rate snapshot test" })).data?.data?.id;
    if (!clientId) throw new Error("client create failed");
  });

  afterAll(async () => {
    if (!clientId) return;
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    await c.query(`DELETE FROM clients WHERE id = $1`, [clientId]).catch(() => {});
    await c.end();
  });

  it("stores the snapshot with production-rate hours", async () => {
    const id = await create({ hours_low: 6, hours_high: 6, hours_source: "production_rate", production_rate_snapshot: SNAPSHOT });
    const row = await snapshotOf(id);
    expect(row.hours_source).toBe("production_rate");
    expect(row.production_rate_snapshot).toMatchObject({ parts: [{ base_rate: 400, rate_unit: "sqft_per_day" }] });
  });

  // The room-by-room form sends painting fields and an engine spec. The engine
  // rewrites the lines, so this is the path that must keep the snapshot.
  async function createPainting(hours: number, lineHours: number) {
    const res = await api("POST", "/api/v1/estimates", {
      client_id: clientId,
      sq_ft: 302,
      prep_level: 3,
      material_cost_cents: 0,
      labor_hours_estimate: hours,
      engine_spec: {
        engineVersion: "2026.05",
        type: "painting",
        paintQuality: "standard",
        rooms: [{ id: "room-0", name: "Bedroom", coats: 2, surfaces: [
          { type: "walls", sqft: 302, condition: "good", prep: "minor", prime: false, textureMatch: false },
        ] }],
      },
      line_items: [{
        description: "Painting labor", quantity: 1, unit_price_cents: 60000, line_item_type: "labor",
        hours_low: lineHours, hours_high: lineHours, hours_source: "production_rate", production_rate_snapshot: SNAPSHOT,
      }],
    });
    expect(res.status).toBe(201);
    return res.data.id as string;
  }

  it("keeps the snapshot when the engine rewrites the painting lines", async () => {
    const id = await createPainting(6, 6);
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    try {
      const { rows } = await c.query(
        `SELECT hours_high::float AS hours_high, hours_source, production_rate_snapshot
         FROM estimate_line_items WHERE estimate_id = $1 AND hours_high IS NOT NULL`,
        [id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ hours_high: 6, hours_source: "production_rate" });
      expect(rows[0].production_rate_snapshot).toMatchObject({ parts: [{ base_rate: 400 }] });
    } finally {
      await c.end();
    }
  });

  it("stamps engine-rewritten hours as the owner's when they differ from the calculation", async () => {
    const id = await createPainting(7, 6);
    const c = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await c.connect();
    try {
      const { rows } = await c.query(
        `SELECT hours_source, production_rate_snapshot FROM estimate_line_items
         WHERE estimate_id = $1 AND hours_high IS NOT NULL`,
        [id],
      );
      expect(rows[0]).toMatchObject({ hours_source: "owner", production_rate_snapshot: null });
    } finally {
      await c.end();
    }
  });

  it("drops a snapshot sent with the owner's hours", async () => {
    const id = await create({ hours_low: 7, hours_high: 7, hours_source: "owner", production_rate_snapshot: SNAPSHOT });
    expect((await snapshotOf(id)).production_rate_snapshot).toBeNull();
  });
});
