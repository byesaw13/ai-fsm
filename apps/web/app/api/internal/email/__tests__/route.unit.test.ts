import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email/mailer", () => ({ sendEmail }));

process.env.LOCATION_INTERNAL_KEY = "test-key";
const { POST } = await import("../route");

const post = (body: unknown, key = "test-key") =>
  POST(new NextRequest("http://localhost/api/internal/email", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify(body),
  }));
const mail = { to: "owner@example.test", subject: "Hi", html: "<p>Hi</p>" };

describe("POST /api/internal/email (TASK-256)", () => {
  beforeEach(() => sendEmail.mockReset());

  it("refuses a request without the internal key", async () => {
    expect((await post(mail, "wrong")).status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("refuses a malformed message", async () => {
    expect((await post({ ...mail, to: "not-an-email" })).status).toBe(400);
  });

  it("sends through the web mailer and reports the result", async () => {
    sendEmail.mockResolvedValue({ ok: true });
    const res = await post(mail);
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(mail);
  });

  it("passes a send failure back so the worker retries", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "SMTP down" });
    const res = await post(mail);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "SMTP down" });
  });
});
