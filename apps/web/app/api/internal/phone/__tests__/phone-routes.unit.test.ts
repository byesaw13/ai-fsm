import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  getOwnerContext: vi.fn(),
  recordDeviceCheckIn: vi.fn(),
  pendingOutboxCount: vi.fn(),
  expireStaleOutbox: vi.fn(),
  claimOutbox: vi.fn(),
  reportOutbox: vi.fn(),
  updateOutboundSmsOutcome: vi.fn(),
  ingestCall: vi.fn(),
  ingestOwnText: vi.fn(),
}));

vi.mock("@/lib/db/phone", () => ({
  getOwnerContext: m.getOwnerContext,
  recordDeviceCheckIn: m.recordDeviceCheckIn,
  pendingOutboxCount: m.pendingOutboxCount,
  expireStaleOutbox: m.expireStaleOutbox,
  claimOutbox: m.claimOutbox,
  reportOutbox: m.reportOutbox,
}));
vi.mock("@/lib/sms/outbound", () => ({ updateOutboundSmsOutcome: m.updateOutboundSmsOutcome }));
vi.mock("@/lib/phone-app/ingest", async (orig) => ({
  ...(await orig<typeof import("@/lib/phone-app/ingest")>()),
  ingestCall: m.ingestCall,
  ingestOwnText: m.ingestOwnText,
}));

process.env.PHONE_APP_KEY = "phone-key";
const checkIn = await import("../check-in/route");
const outbox = await import("../outbox/route");
const report = await import("../outbox/report/route");
const calls = await import("../calls/route");
const texts = await import("../texts/route");

function req(path: string, body: unknown, key = "phone-key") {
  return new NextRequest(`http://localhost/api/internal/phone/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  });
}

const OUTBOX_ID = "6f1c1a52-6f4d-4a8e-9d8a-0b8f3f1f2a11";

describe("Dovetails Phone routes (TASK-260)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getOwnerContext.mockResolvedValue({ accountId: "acct", userId: "owner" });
  });

  it("refuses every route without the phone key", async () => {
    expect((await checkIn.POST(req("check-in", { device_id: "d" }, "wrong"))).status).toBe(401);
    expect((await outbox.POST(req("outbox", { device_id: "d" }, "wrong"))).status).toBe(401);
    expect((await report.POST(req("outbox/report", { reports: [] }, "wrong"))).status).toBe(401);
    expect((await calls.POST(req("calls", { calls: [] }, "wrong"))).status).toBe(401);
    expect((await texts.POST(req("texts", { texts: [] }, "wrong"))).status).toBe(401);
    expect(m.getOwnerContext).not.toHaveBeenCalled();
  });

  it("check-in records the phone and says how many texts wait", async () => {
    m.pendingOutboxCount.mockResolvedValue(2);
    const res = await checkIn.POST(req("check-in", { device_id: "pixel", app_version: "1.0.0", status: { battery: 80 } }));
    expect(res.status).toBe(200);
    expect((await res.json()).pending).toBe(2);
    expect(m.recordDeviceCheckIn).toHaveBeenCalledWith("acct", expect.objectContaining({ deviceId: "pixel", appVersion: "1.0.0" }));
  });

  it("outbox fails expired texts on their log before handing out new ones", async () => {
    m.expireStaleOutbox.mockResolvedValue(["old-1"]);
    m.claimOutbox.mockResolvedValue([{ id: OUTBOX_ID, to_phone: "+16035550142", body: "On the way" }]);
    const res = await outbox.POST(req("outbox", { device_id: "pixel" }));
    expect(m.updateOutboundSmsOutcome).toHaveBeenCalledWith("acct", "old-1", "failed");
    expect(m.claimOutbox).toHaveBeenCalledWith("acct", "pixel", 10);
    expect(await res.json()).toEqual({ messages: [{ id: OUTBOX_ID, phone: "+16035550142", body: "On the way" }] });
  });

  it("report updates the logged text only when the outbox row changed", async () => {
    m.reportOutbox.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = await report.POST(
      req("outbox/report", {
        reports: [
          { id: OUTBOX_ID, status: "delivered" },
          { id: OUTBOX_ID, status: "sent" },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(m.updateOutboundSmsOutcome).toHaveBeenCalledTimes(1);
    expect(m.updateOutboundSmsOutcome).toHaveBeenCalledWith("acct", OUTBOX_ID, "delivered");
    expect((await res.json()).accepted).toHaveLength(2);
  });

  it("calls passes each call through and returns what happened to it", async () => {
    m.ingestCall.mockResolvedValueOnce("logged").mockResolvedValueOnce("not_customer");
    const res = await calls.POST(
      req("calls", {
        calls: [
          { id: "a", phone: "+16035550142", direction: "inbound", result: "missed", started_at: "2026-11-27T14:00:00.000Z", duration_seconds: 0 },
          { id: "b", phone: "+16035550199", direction: "outbound", result: "answered", started_at: "2026-11-27T14:05:00-05:00", duration_seconds: 60 },
        ],
      }),
    );
    expect(await res.json()).toEqual({ ok: true, results: { a: "logged", b: "not_customer" } });
    expect(m.ingestCall.mock.calls[0][1].startedAt).toEqual(new Date("2026-11-27T14:00:00.000Z"));
  });

  it("calls rejects a malformed call", async () => {
    const res = await calls.POST(req("calls", { calls: [{ id: "a", phone: "1", direction: "sideways" }] }));
    expect(res.status).toBe(400);
    expect(m.ingestCall).not.toHaveBeenCalled();
  });

  it("texts logs the owner's texts as the owner", async () => {
    m.ingestOwnText.mockResolvedValue("logged");
    const res = await texts.POST(
      req("texts", { texts: [{ id: "s1", phone: "+16035550142", body: "See you at 9", sent_at: "2026-11-27T13:00:00Z" }] }),
    );
    expect(await res.json()).toEqual({ ok: true, results: { s1: "logged" } });
    expect(m.ingestOwnText).toHaveBeenCalledWith("acct", "owner", expect.objectContaining({ body: "See you at 9" }));
  });
});
