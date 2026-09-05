/**
 * Integration: Web Push subscribe/unsubscribe (TASK-118).
 *
 * Proves the HTTP + DB path: a subscription is stored, scoped to the authed
 * user, upserted (not duplicated) on re-subscribe, and removed on unsubscribe.
 * The send/prune path is unit-tested (send.unit.test.ts); a real push delivery
 * needs a browser + push service and is verified manually.
 *
 * Tier 3. Skipped unless TEST_DATABASE_URL + TEST_BASE_URL are set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL && !!process.env.TEST_BASE_URL;
const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const SEED_OWNER = "11111111-1111-1111-1111-aaaaaaaaaaaa";
const SEED_ACCOUNT = "11111111-1111-1111-1111-111111111111";

const endpoint = `https://push.example/${Math.random().toString(36).slice(2)}`;

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

describe.skipIf(!RUN_INTEGRATION)("web push subscribe/unsubscribe", () => {
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

  const countRows = () =>
    withDirectDb(async (c) => {
      const { rows } = await c.query(
        `SELECT COUNT(*)::int AS n FROM push_subscriptions
          WHERE account_id = $1 AND user_id = $2 AND endpoint = $3`,
        [SEED_ACCOUNT, SEED_OWNER, endpoint],
      );
      return rows[0].n as number;
    });

  beforeAll(async () => {
    const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "owner@test.com", password: "password" }),
    });
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0];
  });

  afterAll(async () => {
    await withDirectDb((c) =>
      c.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]),
    );
  });

  it("stores a subscription scoped to the user", async () => {
    const res = await api("POST", "/api/v1/push/subscribe", {
      endpoint,
      keys: { p256dh: "test-p256dh", auth: "test-auth" },
    });
    expect(res.status).toBe(201);
    expect(await countRows()).toBe(1);
  });

  it("upserts on re-subscribe (no duplicate)", async () => {
    const res = await api("POST", "/api/v1/push/subscribe", {
      endpoint,
      keys: { p256dh: "rotated", auth: "rotated" },
    });
    expect(res.status).toBe(201);
    expect(await countRows()).toBe(1);
  });

  it("removes the subscription on unsubscribe", async () => {
    const res = await api("POST", "/api/v1/push/unsubscribe", { endpoint });
    expect(res.status).toBe(200);
    expect(await countRows()).toBe(0);
  });

  it("rejects a malformed subscription", async () => {
    const res = await api("POST", "/api/v1/push/subscribe", { endpoint: "not-a-url" });
    expect(res.status).toBe(400);
  });
});
