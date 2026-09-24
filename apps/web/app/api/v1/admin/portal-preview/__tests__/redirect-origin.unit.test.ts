import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Behind the proxy, request.url is the container bind address. Redirects must
// use the public APP_URL instead (production bug: https://0.0.0.0:3000/...).
const CLIENT_ID = "0a12810a-98ee-49aa-9cb2-404a35afc8ac";
const INTERNAL = "http://0.0.0.0:3000";

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ userId: "u", accountId: "a", role: "owner" }),
}));
vi.mock("@/lib/auth/permissions", () => ({ canManageClients: () => true }));
vi.mock("@/lib/db", () => ({
  queryOneForSession: async () => ({ id: CLIENT_ID, portal_token: "tok-123" }),
}));
vi.mock("@/lib/portal/session", () => ({
  createPortalSession: async () => "session-token",
  endPortalPreview: async () => undefined,
  PORTAL_SESSION_COOKIE: "portal_session",
  PREVIEW_SESSION_SECONDS: 7200,
}));

describe("portal preview redirects", () => {
  const original = process.env.APP_URL;
  beforeEach(() => {
    process.env.APP_URL = "https://app.example.com";
  });
  afterEach(() => {
    process.env.APP_URL = original;
  });

  it("View Portal redirects to the public origin", async () => {
    const { GET } = await import("../[clientId]/route");
    const res = await GET(new NextRequest(`${INTERNAL}/api/v1/admin/portal-preview/${CLIENT_ID}`), {
      params: Promise.resolve({ clientId: CLIENT_ID }),
    });
    expect(res.headers.get("location")).toBe("https://app.example.com/portal/tok-123");
  });

  it("Exit Preview redirects to the public origin", async () => {
    const { GET } = await import("../exit/route");
    const res = await GET(new NextRequest(`${INTERNAL}/api/v1/admin/portal-preview/exit?client=${CLIENT_ID}`));
    expect(res.headers.get("location")).toBe(`https://app.example.com/app/clients/${CLIENT_ID}`);
  });
});
