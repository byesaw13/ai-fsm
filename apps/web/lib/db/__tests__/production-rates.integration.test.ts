/**
 * Editable production rates with calibration (TASK-193).
 *
 * Tier: HTTP integration. Skips without TEST_DATABASE_URL and TEST_BASE_URL.
 * A tech cannot change rates; an owner can, calibrating stamps the time and
 * uncalibrating clears it; the hours-per-day setting saves.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;

describe.skipIf(!RUN)("production rates settings", () => {
  const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
  let owner = "";
  let tech = "";
  let rateId = "";
  let original: { base_rate: number; calibrated: boolean; calibrated_at: string | null } | null = null;
  let originalHours = 8;

  async function login(email: string, ip: string) {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, password: "password" }),
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    if (!cookie) throw new Error(`login failed for ${email}: ${res.status}`);
    return cookie;
  }

  async function api(cookie: string, method: string, path: string, body?: unknown) {
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

  beforeAll(async () => {
    owner = await login("owner@test.com", "it-production-rates-owner");
    tech = await login("tech@test.com", "it-production-rates-tech");
    const [row] = await db<{ id: string; base_rate: number; calibrated: boolean; calibrated_at: string | null }>(
      `SELECT id, base_rate::float AS base_rate, calibrated, calibrated_at::text FROM production_rates ORDER BY service_code LIMIT 1`,
    );
    rateId = row.id;
    original = row;
    const listed = await api(owner, "GET", "/api/v1/production-rates");
    originalHours = listed.data?.data?.hours_per_day ?? 8;
  });

  afterAll(async () => {
    if (original) {
      await db(`UPDATE production_rates SET base_rate = $2, calibrated = $3, calibrated_at = $4 WHERE id = $1`, [
        rateId, original.base_rate, original.calibrated, original.calibrated_at,
      ]);
    }
    if (owner) await api(owner, "PATCH", "/api/v1/pricing/settings", { hours_per_day: originalHours });
  });

  it("a tech can neither list nor change rates", async () => {
    expect((await api(tech, "GET", "/api/v1/production-rates")).status).toBe(403);
    expect((await api(tech, "PATCH", `/api/v1/production-rates/${rateId}`, { base_rate: 1 })).status).toBe(403);
    const [row] = await db<{ base_rate: number }>(`SELECT base_rate::float AS base_rate FROM production_rates WHERE id = $1`, [rateId]);
    expect(row.base_rate).toBe(original!.base_rate);
  });

  it("the owner lists rates with their modifiers and the hours-per-day setting", async () => {
    const res = await api(owner, "GET", "/api/v1/production-rates");
    expect(res.status).toBe(200);
    expect(res.data.data.rates.length).toBeGreaterThan(0);
    expect(res.data.data.rates[0]).toHaveProperty("modifiers");
    expect(typeof res.data.data.hours_per_day).toBe("number");
  });

  it("calibrating stamps the time, uncalibrating clears it, and the value saves", async () => {
    const on = await api(owner, "PATCH", `/api/v1/production-rates/${rateId}`, { calibrated: true, base_rate: 321 });
    expect(on.status).toBe(200);
    expect(on.data.data).toMatchObject({ base_rate: 321, calibrated: true });
    expect(on.data.data.calibrated_at).not.toBeNull();
    const off = await api(owner, "PATCH", `/api/v1/production-rates/${rateId}`, { calibrated: false });
    expect(off.data.data).toMatchObject({ base_rate: 321, calibrated: false, calibrated_at: null });
  });

  it("refuses an empty or invalid change", async () => {
    expect((await api(owner, "PATCH", `/api/v1/production-rates/${rateId}`, {})).status).toBe(400);
    expect((await api(owner, "PATCH", `/api/v1/production-rates/${rateId}`, { base_rate: -5 })).status).toBe(400);
  });

  it("the hours-per-day setting saves and comes back", async () => {
    const res = await api(owner, "PATCH", "/api/v1/pricing/settings", { hours_per_day: 9.5 });
    expect(res.status).toBe(200);
    expect((await api(owner, "GET", "/api/v1/production-rates")).data.data.hours_per_day).toBe(9.5);
  });
});
