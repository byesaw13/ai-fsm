import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockSession = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
  traceId: "00000000-0000-0000-0000-000000000099",
};

vi.mock("@/lib/auth/middleware", () => ({
  withAuth: (h: Function) => (req: NextRequest) => h(req, mockSession),
  withRole: (_r: string[], h: Function) => (req: NextRequest) => h(req, mockSession),
}));

const mockClientQuery = vi.fn();
vi.mock("@/lib/db", () => ({
  withDbSession: (_s: unknown, fn: (c: unknown) => unknown) => fn({ query: mockClientQuery }),
}));

const mockIsEncryptionConfigured = vi.fn();
vi.mock("@/lib/crypto", () => ({
  isEncryptionConfigured: () => mockIsEncryptionConfigured(),
}));

const mockLoad = vi.fn();
const mockEncrypt = vi.fn(() => Buffer.from("ENC"));
vi.mock("@/lib/integrations/square-payments", () => ({
  loadSquareSettings: (...a: unknown[]) => mockLoad(...a),
  encryptSquareSecrets: (...a: unknown[]) => mockEncrypt(...a),
}));

vi.mock("@/lib/db/audit", () => ({ appendAuditLog: vi.fn() }));

import { GET, PUT } from "../route";

const BASE = "http://localhost:3000/api/v1/integrations/square";
function put(body: unknown): NextRequest {
  return new NextRequest(BASE, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mockIsEncryptionConfigured.mockReturnValue(true);
  mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe("GET /api/v1/integrations/square", () => {
  it("never returns secret values — only booleans", async () => {
    mockLoad.mockResolvedValue({
      enabled: true,
      environment: "production",
      config: { locationId: "LOC1", applicationId: "APP1", webhookUrl: "https://h/w" },
      secrets: { accessToken: "SUPER-SECRET", webhookSignatureKey: "SIGN-SECRET" },
      status: "connected",
      statusDetail: "ok",
      lastCheckedAt: null,
    });
    const res = await GET(new NextRequest(BASE), mockSession);
    expect(res.status).toBe(200);
    const json = await res.json();
    const blob = JSON.stringify(json);
    expect(blob).not.toContain("SUPER-SECRET");
    expect(blob).not.toContain("SIGN-SECRET");
    expect(json.data.hasAccessToken).toBe(true);
    expect(json.data.hasWebhookSignatureKey).toBe(true);
    expect(json.data.locationId).toBe("LOC1");
  });

  it("reports unconfigured when no row exists", async () => {
    mockLoad.mockResolvedValue(null);
    const res = await GET(new NextRequest(BASE), mockSession);
    const json = await res.json();
    expect(json.data.configured).toBe(false);
    expect(json.data.hasAccessToken).toBe(false);
  });
});

describe("PUT /api/v1/integrations/square", () => {
  it("412 when the encryption key is not configured", async () => {
    mockIsEncryptionConfigured.mockReturnValue(false);
    const res = await PUT(put({ enabled: true, environment: "sandbox" }));
    expect(res.status).toBe(412);
  });

  it("400 on an invalid body", async () => {
    const res = await PUT(put({ enabled: "yes", environment: "nope" }));
    expect(res.status).toBe(400);
  });

  it("keeps existing secrets when fields are left blank", async () => {
    mockLoad.mockResolvedValue({
      enabled: false,
      environment: "sandbox",
      config: { locationId: "OLD", applicationId: null, webhookUrl: null },
      secrets: { accessToken: "KEEP-TOKEN", webhookSignatureKey: "KEEP-KEY" },
      status: "disconnected",
      statusDetail: null,
      lastCheckedAt: null,
    });
    const res = await PUT(put({ enabled: true, environment: "sandbox" }));
    expect(res.status).toBe(200);
    // secrets merged: existing values retained when not provided
    expect(mockEncrypt).toHaveBeenCalledWith({ accessToken: "KEEP-TOKEN", webhookSignatureKey: "KEEP-KEY" });
  });

  it("stores newly provided secrets", async () => {
    mockLoad.mockResolvedValue(null);
    const res = await PUT(put({ enabled: true, environment: "production", accessToken: "NEW-TOKEN", webhookSignatureKey: "NEW-KEY", locationId: "LOC9" }));
    expect(res.status).toBe(200);
    expect(mockEncrypt).toHaveBeenCalledWith({ accessToken: "NEW-TOKEN", webhookSignatureKey: "NEW-KEY" });
  });
});
