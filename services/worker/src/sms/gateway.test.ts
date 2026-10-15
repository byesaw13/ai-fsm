import { afterEach, describe, expect, it, vi } from "vitest";
import { gatewayHealth, sendSms } from "./gateway.js";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SMS_INTERNAL_KEY;
  delete process.env.SMS_WEB_URL;
});

describe("worker sms dispatch", () => {
  it("asks the web tier to send, and does not call the cloud gateway", async () => {
    process.env.SMS_INTERNAL_KEY = "test-key";
    process.env.SMS_WEB_URL = "http://web:3000";
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe("http://web:3000/api/internal/sms/dispatch");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
      expect(String(url)).not.toContain("sms-gate.app");
      return new Response(JSON.stringify({ ok: true, messageId: "msg-1" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendSms("+19788367839", "Dovetails: on the way.")).resolves.toEqual({
      ok: true,
      messageId: "msg-1",
    });
  });

  it("reads the phone check-in from the web tier", async () => {
    process.env.SMS_INTERNAL_KEY = "test-key";
    process.env.SMS_WEB_URL = "http://web:3000";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ configured: true, lastSeen: "2026-10-15T05:20:00.000Z" }), { status: 200 }))
    );
    await expect(gatewayHealth()).resolves.toEqual({
      configured: true,
      lastSeen: new Date("2026-10-15T05:20:00.000Z"),
    });
  });
});
