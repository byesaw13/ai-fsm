/**
 * Integration: queued email goes out through the web tier, and a final failure
 * tells the owner once a day (TASK-256).
 *
 * Skipped unless TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Client } from "pg";
import { dispatchNotificationQueue } from "./dispatch.js";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
const ACCOUNT = "11111111-1111-1111-1111-111111111111";

describe.skipIf(!TEST_DB_URL)("dispatchNotificationQueue (TASK-256)", () => {
  let client: Client;
  const ids: string[] = [];
  // Other pending rows are parked in the future for the test and put back after.
  let parked: { id: string; next_attempt_at: Date }[] = [];

  const enqueue = async (maxAttempts = 1) => {
    const { rows } = await client.query(
      `INSERT INTO notification_queue
         (account_id, automation_type, priority, channel, to_address, subject, html_body,
          idempotency_key, max_attempts, next_attempt_at, status)
       VALUES ($1, 'test_dispatch', 10, 'email', 'owner@example.test', 'Hi', '<p>Hi</p>',
               $2, $3, now() - interval '1 minute', 'pending')
       RETURNING id`,
      [ACCOUNT, `test-dispatch-${Date.now()}-${Math.random()}`, maxAttempts],
    );
    ids.push(rows[0].id);
    return rows[0].id as string;
  };
  const status = async (id: string) =>
    (await client.query(`SELECT status FROM notification_queue WHERE id = $1`, [id])).rows[0].status;
  const failureAlerts = async () =>
    Number((await client.query(
      `SELECT count(*) FROM attention_events WHERE account_id = $1 AND type = 'notification.failed'`, [ACCOUNT],
    )).rows[0].count);

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DB_URL });
    await client.connect();
    process.env.LOCATION_INTERNAL_KEY = "test-key";
    process.env.WEB_INTERNAL_URL = "http://web.test";
    parked = (await client.query(
      `SELECT id, next_attempt_at FROM notification_queue WHERE status = 'pending'`,
    )).rows;
    await client.query(
      `UPDATE notification_queue SET next_attempt_at = now() + interval '100 years' WHERE id = ANY($1)`,
      [parked.map((p) => p.id)],
    );
  });

  beforeEach(async () => {
    await client.query(`DELETE FROM attention_events WHERE account_id = $1 AND type = 'notification.failed'`, [ACCOUNT]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const p of parked) {
      await client.query(`UPDATE notification_queue SET next_attempt_at = $2 WHERE id = $1`, [p.id, p.next_attempt_at]);
    }
    await client.query(`DELETE FROM notification_queue WHERE id = ANY($1)`, [ids]);
    await client.query(`DELETE FROM attention_events WHERE account_id = $1 AND type = 'notification.failed'`, [ACCOUNT]);
    await client.end();
  });

  it("hands the email to the web tier with the internal key and marks it sent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const id = await enqueue();

    await dispatchNotificationQueue(client);

    expect(await status(id)).toBe("sent");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://web.test/api/internal/email");
    expect(init.headers["x-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body)).toMatchObject({ to: "owner@example.test", subject: "Hi" });
  });

  it("a final failure tells the owner, once per day", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ ok: false, error: "SMTP down" }), { status: 502 }),
    ));
    const a = await enqueue();
    const b = await enqueue();

    await dispatchNotificationQueue(client);

    expect(await status(a)).toBe("failed");
    expect(await status(b)).toBe("failed");
    expect(await failureAlerts()).toBe(1);
  });
});
