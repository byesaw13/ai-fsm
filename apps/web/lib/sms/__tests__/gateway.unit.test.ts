import { afterEach, describe, expect, it, vi } from "vitest";
import { isSmsGatewayConfigured, sendSmsViaGateway } from "../gateway";

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
