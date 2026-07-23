/**
 * Integration tests: Operations Engine lifecycle INDEPENDENCE.
 *
 * The whole point of the model (docs/canonical/OPERATIONS.md) is that payroll,
 * activity, mileage, and the business day are independent lifecycles — closing
 * one must never move another. These tests prove that against the real endpoints.
 *
 * Tier: HTTP integration (Tier 3). Skipped unless TEST_DATABASE_URL + TEST_BASE_URL
 * are set (a running server against a seeded DB). See docs/TEST_MATRIX.md.
 *
 *   TEST_DATABASE_URL=postgresql://... TEST_BASE_URL=http://localhost:3000 pnpm test
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { Client } from "pg";

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!RUN_INTEGRATION)("Operations Engine — lifecycle independence", () => {
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

  const isClockedIn = async () => !!(await api("GET", "/api/v1/time-clock/current")).json.data;
  const activeActivity = async () => (await api("GET", "/api/v1/activities/today")).json.data?.active ?? null;
  // Direct DB read — the business-day read route was deleted (no UI consumer);
  // the transition endpoint under test is exercised via HTTP as before.
  const currentDay = async (): Promise<{ id: string; status: string } | null> => {
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    try {
      const { rows } = await client.query(
        `SELECT bd.id, bd.status FROM business_days bd
         JOIN users u ON u.id = bd.user_id AND u.email = 'owner@test.com'
         ORDER BY bd.business_date DESC, bd.created_at DESC LIMIT 1`,
      );
      return rows[0] ?? null;
    } finally {
      await client.end();
    }
  };

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  });

  // Normalize shared owner state: clocked out, no active activity, day not closed.
  beforeEach(async () => {
    await api("POST", "/api/v1/time-clock/clock-out"); // 409 if not clocked in — fine
    await api("POST", "/api/v1/activities/stop"); // no-op if nothing active
    const day = await currentDay();
    if (day?.status === "CLOSED") {
      await api("POST", "/api/v1/business-day/transition", { id: day.id, to: "REOPENED", reason: "test reset" });
    }
  });

  it("closing a mileage session does NOT stop activity or payroll", async () => {
    await api("POST", "/api/v1/time-clock/clock-in");
    await api("POST", "/api/v1/activities/switch", { activity_type: "job_work" });

    // Start a mileage session at a valid (monotonic) odometer, then close it.
    const vehicles = (await api("GET", "/api/v1/vehicles")).json.data ?? [];
    const odo = (vehicles[0]?.current_odometer ?? 100000) + 5;
    const start = await api("POST", "/api/v1/sessions/start", { start_odometer: odo });
    expect(start.status).toBe(201);
    const close = await api("PATCH", `/api/v1/sessions/${start.json.data.id}`, { end_odometer: odo + 10 });
    expect(close.status).toBeLessThan(300);

    // Independence: the clock and the activity are untouched by closing mileage.
    expect(await isClockedIn()).toBe(true);
    expect((await activeActivity())?.activity_type).toBe("job_work");
  });

  it("clocking out does NOT stop activity or close the business day", async () => {
    await api("POST", "/api/v1/time-clock/clock-in"); // also opens the day
    await api("POST", "/api/v1/activities/switch", { activity_type: "travel" });

    const out = await api("POST", "/api/v1/time-clock/clock-out");
    expect(out.status).toBeLessThan(300);

    expect(await isClockedIn()).toBe(false); // payroll closed (as asked)
    expect((await activeActivity())?.activity_type).toBe("travel"); // activity still running
    expect((await currentDay())?.status).not.toBe("CLOSED"); // day still open
  });

  it("closing the business day does NOT stop payroll or activity", async () => {
    await api("POST", "/api/v1/time-clock/clock-in"); // opens the day
    await api("POST", "/api/v1/activities/switch", { activity_type: "admin" });

    const day = await currentDay();
    await api("POST", "/api/v1/business-day/transition", { id: day.id, to: "READY_TO_CLOSE" });
    const closed = await api("POST", "/api/v1/business-day/transition", { id: day.id, to: "CLOSED" });
    expect(closed.status).toBeLessThan(300);

    expect(await isClockedIn()).toBe(true); // payroll keeps running
    expect((await activeActivity())?.activity_type).toBe("admin"); // activity keeps running
  });

  it("switching activity does NOT affect the payroll clock", async () => {
    const inRes = await api("POST", "/api/v1/time-clock/clock-in");
    const clockId = inRes.json.data.id;

    await api("POST", "/api/v1/activities/switch", { activity_type: "job_work" });
    await api("POST", "/api/v1/activities/switch", { activity_type: "travel" });

    const after = (await api("GET", "/api/v1/time-clock/current")).json.data;
    expect(after?.id).toBe(clockId); // same clock — never reopened/closed by activity
    expect(after?.status).toBe("open");
  });
});
