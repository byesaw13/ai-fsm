/**
 * Integration tests: payroll clock corrections (TASK-052).
 *
 * Proves the runtime path the unit tests can't reach: the void + re-add SQL,
 * that the re-added session carries the original's user/day/pay fields, and that
 * RLS/guards return not-found (not 500) for a session that isn't correctable.
 *
 * Tier: HTTP integration (Tier 3). Skipped unless TEST_DATABASE_URL + TEST_BASE_URL
 * are set (a running server against a seeded DB). See docs/TEST_MATRIX.md.
 *
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3000 pnpm test:integration
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Client } from "pg";

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";

async function withDirectDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `SELECT set_config('app.current_account_id',$1,false),
              set_config('app.current_user_id',$2,false),
              set_config('app.current_role','owner',false)`,
      [SEED_ACCOUNT, SEED_OWNER],
    );
    return await run(client);
  } finally {
    await client.end();
  }
}

describe.skipIf(!RUN_INTEGRATION)("payroll clock corrections", () => {
  let cookie: string;

  async function api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json } as { status: number; json: any };
  }

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  });

  // No open, non-voided clock leaking between tests (the one-open-clock index).
  beforeEach(async () => {
    await api("POST", "/api/v1/time-clock/clock-out"); // 409 if not clocked in — fine
  });

  it("correct voids the original and re-adds a session carrying its day/pay fields", async () => {
    const clockIn = await api("POST", "/api/v1/time-clock/clock-in");
    expect(clockIn.status).toBeLessThan(300);
    const original = clockIn.json.data;
    expect(original.status).toBe("open");

    const newIn = "2026-09-04T13:00:00.000Z";
    const newOut = "2026-09-04T17:00:00.000Z";
    const res = await api("POST", `/api/v1/time-clock/${original.id}/correct`, {
      clock_in_at: newIn,
      clock_out_at: newOut,
      reason: "forgot to clock out",
    });
    expect(res.status).toBe(201);
    const corrected = res.json.data;

    // Re-add, never edit-in-place: a new row with the corrected times.
    expect(corrected.id).not.toBe(original.id);
    expect(corrected.status).toBe("closed");
    expect(new Date(corrected.clock_in_at).toISOString()).toBe(newIn);
    expect(new Date(corrected.clock_out_at).toISOString()).toBe(newOut);
    // Carried the original's day + pay fields.
    expect(corrected.business_day_id).toBe(original.business_day_id);
    expect(corrected.pay_type).toBe(original.pay_type);

    // Original is voided with the reason; the new row is not.
    await withDirectDb(async (client) => {
      const { rows } = await client.query(
        `SELECT id, voided_at, correction_reason FROM time_clock_sessions WHERE id = ANY($1)`,
        [[original.id, corrected.id]],
      );
      const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));
      expect(byId[original.id].voided_at).not.toBeNull();
      expect(byId[original.id].correction_reason).toBe("forgot to clock out");
      expect(byId[corrected.id].voided_at).toBeNull();
    });

    // Clean up the corrected (now-open? no, it's closed) row is unnecessary;
    // clock out any residual open clock happens in beforeEach.
  });

  it("void marks the session voided and drops it from today's list", async () => {
    const clockIn = await api("POST", "/api/v1/time-clock/clock-in");
    const id = clockIn.json.data.id;

    const before = await api("GET", "/api/v1/time-clock/today");
    expect(before.json.data.some((r: any) => r.id === id)).toBe(true);

    const res = await api("POST", `/api/v1/time-clock/${id}/void`, { reason: "clocked in by mistake" });
    expect(res.status).toBe(200);

    const after = await api("GET", "/api/v1/time-clock/today");
    expect(after.json.data.some((r: any) => r.id === id)).toBe(false);

    await withDirectDb(async (client) => {
      const { rows } = await client.query(
        `SELECT voided_at, correction_reason FROM time_clock_sessions WHERE id = $1`,
        [id],
      );
      expect(rows[0].voided_at).not.toBeNull();
      expect(rows[0].correction_reason).toBe("clocked in by mistake");
    });
  });

  it("returns 404 (not 500) for a session that isn't correctable", async () => {
    const missing = "99999999-9999-9999-9999-999999999999";
    const voidRes = await api("POST", `/api/v1/time-clock/${missing}/void`, { reason: "x" });
    expect(voidRes.status).toBe(404);
    const correctRes = await api("POST", `/api/v1/time-clock/${missing}/correct`, {
      clock_in_at: "2026-09-04T13:00:00.000Z",
      reason: "x",
    });
    expect(correctRes.status).toBe(404);
  });

  it("rejects an invalid correction (clock-out before clock-in) with 400", async () => {
    const clockIn = await api("POST", "/api/v1/time-clock/clock-in");
    const id = clockIn.json.data.id;
    const res = await api("POST", `/api/v1/time-clock/${id}/correct`, {
      clock_in_at: "2026-09-04T17:00:00.000Z",
      clock_out_at: "2026-09-04T13:00:00.000Z",
      reason: "bad",
    });
    expect(res.status).toBe(400);
  });
});
