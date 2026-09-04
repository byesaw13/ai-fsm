import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the markFailed UPDATE.
const poolQuery = vi.fn().mockResolvedValue({ rows: [] });
const clientQuery = vi.fn();
const release = vi.fn();

vi.mock("@/lib/db", () => ({
  getPool: () => ({
    query: poolQuery,
    connect: async () => ({ query: clientQuery, release }),
  }),
}));

const sendNotification = vi.fn();
vi.mock("@/lib/push/vapid", () => ({
  getWebPush: () => ({ sendNotification }),
}));

const listSubscriptionsForUsers = vi.fn();
vi.mock("@/lib/push/subscriptions", () => ({
  listSubscriptionsForUsers: (...args: unknown[]) => listSubscriptionsForUsers(...args),
}));

import { sendPushToUsers } from "@/lib/push/send";

const rows = [
  { id: "sub-live", endpoint: "https://push/live", p256dh: "a", auth: "b" },
  { id: "sub-dead", endpoint: "https://push/dead", p256dh: "c", auth: "d" },
];

describe("sendPushToUsers", () => {
  beforeEach(() => {
    poolQuery.mockClear();
    sendNotification.mockReset();
    listSubscriptionsForUsers.mockReset();
    listSubscriptionsForUsers.mockResolvedValue(rows);
  });

  it("delivers to live subs and prunes ones that return 410", async () => {
    sendNotification.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint.endsWith("/dead")) return Promise.reject({ statusCode: 410 });
      return Promise.resolve();
    });

    const sent = await sendPushToUsers("acct-1", ["u1"], { title: "Hi", url: "/app" });

    expect(sent).toBe(1);
    // The dead subscription was marked failed_at, by id.
    const updateCall = poolQuery.mock.calls.find((c) => String(c[0]).includes("failed_at"));
    expect(updateCall).toBeTruthy();
    expect(updateCall![1]).toEqual([["sub-dead"]]);
  });

  it("does not prune on a transient (non-410) error", async () => {
    sendNotification.mockRejectedValue({ statusCode: 500 });
    const sent = await sendPushToUsers("acct-1", ["u1"], { title: "Hi" });
    expect(sent).toBe(0);
    expect(poolQuery.mock.calls.some((c) => String(c[0]).includes("failed_at"))).toBe(false);
  });
});
