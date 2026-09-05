import { describe, it, expect, vi, beforeEach } from "vitest";

// Route client.query by SQL text: return subscription rows for the SELECT,
// capture the failed_at UPDATE, ack BEGIN/COMMIT/set_config.
const rows = [
  { id: "sub-live", user_id: "u1", endpoint: "https://push/live", p256dh: "a", auth: "b" },
  { id: "sub-dead", user_id: "u1", endpoint: "https://push/dead", p256dh: "c", auth: "d" },
];
const updateCalls: Array<{ sql: string; params: unknown[] }> = [];

const clientQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.includes("FROM push_subscriptions") && sql.includes("SELECT")) return { rows };
  if (sql.includes("failed_at")) {
    updateCalls.push({ sql, params: params ?? [] });
    return { rows: [] };
  }
  return { rows: [] };
});
const release = vi.fn();

vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: async () => ({ query: clientQuery, release }) }),
}));

const sendNotification = vi.fn();
vi.mock("@/lib/push/vapid", () => ({ getWebPush: () => ({ sendNotification }) }));

import { sendPushToUsers } from "@/lib/push/send";

describe("sendPushToUsers", () => {
  beforeEach(() => {
    clientQuery.mockClear();
    sendNotification.mockReset();
    updateCalls.length = 0;
  });

  it("delivers to live subs and prunes ones that return 410", async () => {
    sendNotification.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint.endsWith("/dead") ? Promise.reject({ statusCode: 410 }) : Promise.resolve(),
    );

    const sent = await sendPushToUsers("acct-1", ["u1"], { title: "Hi", url: "/app" });

    expect(sent).toBe(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].params).toEqual([["sub-dead"]]);
  });

  it("does not prune on a transient (non-410) error", async () => {
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const sent = await sendPushToUsers("acct-1", ["u1"], { title: "Hi" });
    expect(sent).toBe(0);
    expect(updateCalls).toHaveLength(0);
  });

  it("sets the account RLS context before reading", async () => {
    sendNotification.mockResolvedValue(undefined);
    await sendPushToUsers("acct-9", ["u1"], { title: "Hi" });
    const setConfig = clientQuery.mock.calls.find((c) => String(c[0]).includes("app.current_account_id"));
    expect(setConfig).toBeTruthy();
    expect(setConfig![1]).toEqual(["acct-9"]);
  });
});
