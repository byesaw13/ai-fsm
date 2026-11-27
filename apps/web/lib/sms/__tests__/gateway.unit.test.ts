import { afterEach, describe, expect, it, vi } from "vitest";
import { gatewayDevicesLastSeen, isSmsGatewayConfigured, sendSmsViaGateway } from "../gateway";

const phoneDb = vi.hoisted(() => ({
  getOwnerContext: vi.fn(),
  enqueuePhoneText: vi.fn(),
  phoneLastSeen: vi.fn(),
}));
vi.mock("@/lib/db/phone", () => phoneDb);

describe("isSmsGatewayConfigured", () => {
  afterEach(() => {
    delete process.env.SMS_GATEWAY_URL;
    delete process.env.SMS_GATEWAY_USERNAME;
    delete process.env.SMS_GATEWAY_PASSWORD;
  });

  it("is false when env missing", () => {
    expect(isSmsGatewayConfigured()).toBe(false);
  });

  it("is true when all three set", () => {
    process.env.SMS_GATEWAY_URL = "https://api.sms-gate.app/3rdparty/v1/messages";
    process.env.SMS_GATEWAY_USERNAME = "u";
    process.env.SMS_GATEWAY_PASSWORD = "p";
    expect(isSmsGatewayConfigured()).toBe(true);
  });
});

describe("sendSmsViaGateway", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SMS_GATEWAY_URL;
    delete process.env.SMS_GATEWAY_USERNAME;
    delete process.env.SMS_GATEWAY_PASSWORD;
    delete process.env.SMS_GATEWAY_SIM_NUMBER;
  });

  it("returns not-configured without env", async () => {
    const r = await sendSmsViaGateway({ phone: "+16035551212", message: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not configured/i);
  });

  it("posts textMessage payload with basic auth", async () => {
    process.env.SMS_GATEWAY_URL = "https://api.sms-gate.app/3rdparty/v1/messages";
    process.env.SMS_GATEWAY_USERNAME = "user";
    process.env.SMS_GATEWAY_PASSWORD = "pass";
    process.env.SMS_GATEWAY_SIM_NUMBER = "1";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "msg-abc", state: "Pending" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await sendSmsViaGateway({
      phone: "+16035551212",
      message: "Hello from app",
      id: "client-corr-1",
    });

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.messageId).toBe("msg-abc");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/messages");
    expect(opts.method).toBe("POST");
    const headers = opts.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    const body = JSON.parse(String(opts.body));
    expect(body.phoneNumbers).toEqual(["+16035551212"]);
    expect(body.textMessage.text).toBe("Hello from app");
    expect(body.simNumber).toBe(1);
    expect(body.id).toBe("client-corr-1");
  });

  it("surfaces gateway error body", async () => {
    process.env.SMS_GATEWAY_URL = "https://api.sms-gate.app/3rdparty/v1/messages";
    process.env.SMS_GATEWAY_USERNAME = "user";
    process.env.SMS_GATEWAY_PASSWORD = "pass";

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ message: "queue limits exceeded" }),
      })
    );

    const r = await sendSmsViaGateway({ phone: "+16035551212", message: "hi" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(503);
      expect(r.error).toMatch(/queue limits/i);
    }
  });
});

describe("SMS_TRANSPORT=phone_app (TASK-260)", () => {
  afterEach(() => {
    delete process.env.SMS_TRANSPORT;
    delete process.env.PHONE_APP_KEY;
    vi.unstubAllGlobals();
  });

  it("is configured by the phone key alone", () => {
    process.env.SMS_TRANSPORT = "phone_app";
    expect(isSmsGatewayConfigured()).toBe(false);
    process.env.PHONE_APP_KEY = "k";
    expect(isSmsGatewayConfigured()).toBe(true);
  });

  it("queues the text for the phone instead of calling the gateway", async () => {
    process.env.SMS_TRANSPORT = "phone_app";
    process.env.PHONE_APP_KEY = "k";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    phoneDb.getOwnerContext.mockResolvedValue({ accountId: "acct", userId: "u" });
    phoneDb.enqueuePhoneText.mockResolvedValue("outbox-1");

    const r = await sendSmsViaGateway({ phone: "+16035551212", message: "On the way" });
    expect(r).toEqual({ ok: true, messageId: "outbox-1" });
    expect(phoneDb.enqueuePhoneText).toHaveBeenCalledWith("acct", "+16035551212", "On the way");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the phone's last check-in as the gateway's", async () => {
    process.env.SMS_TRANSPORT = "phone_app";
    process.env.PHONE_APP_KEY = "k";
    const seen = new Date("2026-11-27T12:00:00Z");
    phoneDb.getOwnerContext.mockResolvedValue({ accountId: "acct", userId: "u" });
    phoneDb.phoneLastSeen.mockResolvedValue(seen);
    expect(await gatewayDevicesLastSeen()).toEqual(seen);
  });
});
