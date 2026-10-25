import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPoolQuery = vi.fn();
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: mockPoolQuery }) }));

const mockCtxQuery = vi.fn();
vi.mock("@/lib/invoices/db", () => ({
  withInvoiceContext: (_s: unknown, fn: (c: unknown) => unknown) => fn({ query: mockCtxQuery }),
}));

const mockSend = vi.fn();
vi.mock("@/lib/invoices/send", () => ({ sendInvoice: (...a: unknown[]) => mockSend(...a) }));

import { autoSendDepositEnabled, requestDepositAfterApproval, scheduleItemTitle } from "../deposit-request";

const ROW = { account_id: "acct", settings: {}, owner_id: "owner", invoice_id: "inv1", job_id: "job1" };

function attemptUpdate() {
  return mockCtxQuery.mock.calls.find((c) => String(c[0]).includes("UPDATE invoice_delivery_attempts"))?.[1] as unknown[] | undefined;
}
function itemNote() {
  return mockCtxQuery.mock.calls.find((c) => String(c[0]).includes("UPDATE action_items"))?.[1]?.[0] as string | undefined;
}

beforeEach(() => {
  mockPoolQuery.mockReset().mockResolvedValue({ rows: [ROW] });
  mockCtxQuery.mockReset().mockImplementation(async (sql: string) => {
    if (sql.includes("INSERT INTO invoice_delivery_attempts")) return { rows: [{ id: "att1" }] };
    return { rows: [] };
  });
  mockSend.mockReset().mockResolvedValue({ status: 200, sentTo: "pat@example.com", isPaid: false });
});

describe("scheduleItemTitle", () => {
  it("waits on the deposit when it is due on acceptance or before scheduling", () => {
    expect(scheduleItemTitle(true, "on_acceptance")).toBe("Schedule this job — waiting on deposit");
    expect(scheduleItemTitle(true, "before_scheduling")).toBe("Schedule this job — waiting on deposit");
  });

  it("is ready to book when the deposit is due later or there is none", () => {
    expect(scheduleItemTitle(true, "before_material_order")).toMatch(/^Schedule this job — ready to book; deposit due before materials/);
    expect(scheduleItemTitle(true, "custom")).toMatch(/ready to book; deposit due per the written terms/);
    expect(scheduleItemTitle(false, "before_scheduling")).toBe("Schedule this job — ready to book");
  });
});

describe("autoSendDepositEnabled", () => {
  it("is on unless explicitly turned off", () => {
    expect(autoSendDepositEnabled({})).toBe(true);
    expect(autoSendDepositEnabled(null)).toBe(true);
    expect(autoSendDepositEnabled({ auto_send_deposit_request: false })).toBe(false);
  });
});

describe("requestDepositAfterApproval", () => {
  it("records a pending attempt before sending, then marks it delivered", async () => {
    expect(await requestDepositAfterApproval("e1")).toBe("sent");
    const insertIdx = mockCtxQuery.mock.calls.findIndex((c) => String(c[0]).includes("INSERT INTO invoice_delivery_attempts"));
    expect(insertIdx).toBeGreaterThanOrEqual(0);
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acct", userId: "owner", role: "owner" }), "inv1");
    expect(attemptUpdate()?.slice(0, 1)).toEqual(["delivered"]);
    expect(itemNote()).toBeUndefined();
  });

  it("a failure before contact is recorded as failed and noted on the schedule item", async () => {
    mockSend.mockResolvedValueOnce({ status: 422, message: "Client has no email address on file" });
    expect(await requestDepositAfterApproval("e1")).toBe("failed");
    expect(attemptUpdate()?.slice(0, 2)).toEqual(["failed", "Client has no email address on file"]);
    expect(itemNote()).toMatch(/deposit request not sent \(Client has no email address on file\)/);
  });

  it("a delivery error (502) is unknown, never treated as safe to resend", async () => {
    mockSend.mockResolvedValueOnce({ status: 502, message: "Email send failed: socket hang up" });
    expect(await requestDepositAfterApproval("e1")).toBe("unknown");
    expect(attemptUpdate()?.slice(0, 2)).toEqual(["unknown", "Email send failed: socket hang up"]);
    expect(itemNote()).toMatch(/may not have gone out; check before resending/);
  });

  it("email not configured (503) is a failure before contact", async () => {
    mockSend.mockResolvedValueOnce({ status: 503, message: "Email is not configured on this server" });
    expect(await requestDepositAfterApproval("e1")).toBe("failed");
  });

  it("claims the attempt in one statement guarded by the unique index", async () => {
    await requestDepositAfterApproval("e1");
    const claim = mockCtxQuery.mock.calls.find((c) => String(c[0]).includes("INSERT INTO invoice_delivery_attempts"))?.[0] as string;
    expect(claim).toMatch(/ON CONFLICT \(invoice_id\) WHERE outcome <> 'failed' DO NOTHING/);
  });

  it("an error partway through is unknown, and the item says to check before resending", async () => {
    mockSend.mockRejectedValueOnce(new Error("connection reset"));
    expect(await requestDepositAfterApproval("e1")).toBe("unknown");
    expect(attemptUpdate()?.[0]).toBe("unknown");
    expect(itemNote()).toMatch(/may not have gone out; check before resending/);
  });

  it("never sends when the claim loses to an earlier delivered, pending or unknown attempt", async () => {
    mockCtxQuery.mockImplementation(async () => ({ rows: [] })); // ON CONFLICT DO NOTHING returned no row
    expect(await requestDepositAfterApproval("e1")).toBe("already_handled");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does nothing when the account turned it off or there is no draft deposit", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...ROW, settings: { auto_send_deposit_request: false } }] });
    expect(await requestDepositAfterApproval("e1")).toBe("disabled");
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ ...ROW, invoice_id: null }] });
    expect(await requestDepositAfterApproval("e1")).toBe("no_deposit");
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("never throws", async () => {
    mockPoolQuery.mockRejectedValueOnce(new Error("db down"));
    expect(await requestDepositAfterApproval("e1")).toBe("unknown");
  });
});
