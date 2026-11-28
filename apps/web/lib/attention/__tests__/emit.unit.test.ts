import { describe, expect, it, vi, beforeEach } from "vitest";

const enqueue = vi.fn();
vi.mock("../email", () => ({
  enqueueAttentionOwnerEmail: (...a: unknown[]) => enqueue(...a),
}));
vi.mock("@/lib/push/send", () => ({ sendPushToOwners: vi.fn() }));

import { emitAttentionEvent } from "../emit";

const input = {
  accountId: "acc",
  type: "invoice.paid",
  entityType: "invoice",
  entityId: "inv-1",
  title: "Invoice paid",
  href: "/app/invoices/inv-1",
} as never;

function client(inTx: boolean) {
  const sql: string[] = [];
  return {
    sql,
    query: vi.fn(async (q: string) => {
      sql.push(q);
      if (q.startsWith("SAVEPOINT") && !inTx) {
        throw Object.assign(new Error("SAVEPOINT can only be used in transaction blocks"), {
          code: "25P01",
        });
      }
      return { rows: [{ id: "evt-1" }] };
    }),
  };
}

describe("emitAttentionEvent owner email", () => {
  beforeEach(() => enqueue.mockReset());

  it("queues the email when called outside a transaction", async () => {
    const c = client(false);
    expect(await emitAttentionEvent(c as never, input)).toBe("evt-1");
    expect(enqueue).toHaveBeenCalledOnce();
    expect(c.sql.some((q) => q.startsWith("RELEASE"))).toBe(false);
  });

  it("wraps the email in a savepoint inside a transaction", async () => {
    const c = client(true);
    await emitAttentionEvent(c as never, input);
    expect(enqueue).toHaveBeenCalledOnce();
    expect(c.sql).toContain("RELEASE SAVEPOINT attention_email");
  });

  it("rolls back to the savepoint when the enqueue fails in a transaction", async () => {
    enqueue.mockRejectedValueOnce(new Error("boom"));
    const c = client(true);
    expect(await emitAttentionEvent(c as never, input)).toBe("evt-1");
    expect(c.sql).toContain("ROLLBACK TO SAVEPOINT attention_email");
  });
});
