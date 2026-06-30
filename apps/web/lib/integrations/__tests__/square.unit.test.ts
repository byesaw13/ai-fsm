import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PoolClient } from "pg";

// ---------------------------------------------------------------------------
// Mock the Square SDK and crypto so no network/keys are involved.
// ---------------------------------------------------------------------------
const mockClient = {
  locations: { list: vi.fn() },
  checkout: { paymentLinks: { create: vi.fn() } },
  payments: { get: vi.fn() },
};

vi.mock("square", () => ({
  SquareClient: vi.fn(() => mockClient),
  SquareEnvironment: { Production: "production", Sandbox: "sandbox" },
  WebhooksHelper: { verifySignature: vi.fn() },
}));

vi.mock("@/lib/crypto", () => ({
  encryptJson: vi.fn(() => Buffer.from("ENCRYPTED")),
  decryptJson: vi.fn(() => ({ accessToken: "tok", webhookSignatureKey: "whk" })),
}));

import { WebhooksHelper } from "square";
import {
  loadSquareSettings,
  encryptSquareSecrets,
  testSquareConnection,
  createSquarePaymentLink,
  verifySquareWebhook,
  type SquareSettingsRow,
} from "../square-payments";

function row(overrides: Partial<SquareSettingsRow> = {}): SquareSettingsRow {
  return {
    enabled: true,
    environment: "sandbox",
    config: { locationId: "LOC1", applicationId: "APP1", webhookUrl: null },
    secrets: { accessToken: "tok", webhookSignatureKey: "whk" },
    status: "connected",
    statusDetail: null,
    lastCheckedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadSquareSettings", () => {
  it("returns null when no row exists", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
    const out = await loadSquareSettings(client as unknown as PoolClient, "acct");
    expect(out).toBeNull();
  });

  it("decrypts secrets when a row exists", async () => {
    const client = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{
          enabled: true,
          environment: "sandbox",
          config: { locationId: "LOC1", applicationId: "APP1", webhookUrl: null },
          secrets: Buffer.from("blob"),
          status: "connected",
          status_detail: null,
          last_checked_at: null,
        }],
      }),
    };
    const out = await loadSquareSettings(client as unknown as PoolClient, "acct");
    expect(out?.secrets.accessToken).toBe("tok");
    expect(out?.config.locationId).toBe("LOC1");
  });
});

describe("encryptSquareSecrets", () => {
  it("delegates to crypto.encryptJson", () => {
    const buf = encryptSquareSecrets({ accessToken: "a", webhookSignatureKey: "b" });
    expect(Buffer.isBuffer(buf)).toBe(true);
  });
});

describe("testSquareConnection", () => {
  it("fails fast when no access token", async () => {
    const out = await testSquareConnection(row({ secrets: { accessToken: null, webhookSignatureKey: null } }));
    expect(out.ok).toBe(false);
  });

  it("succeeds when the configured location is returned", async () => {
    mockClient.locations.list.mockResolvedValue({ locations: [{ id: "LOC1" }] });
    const out = await testSquareConnection(row());
    expect(out.ok).toBe(true);
    expect(out.detail).toMatch(/1 location/);
  });

  it("fails when the configured location is missing", async () => {
    mockClient.locations.list.mockResolvedValue({ locations: [{ id: "OTHER" }] });
    const out = await testSquareConnection(row());
    expect(out.ok).toBe(false);
    expect(out.detail).toMatch(/not found/);
  });

  it("reports the error when the SDK throws", async () => {
    mockClient.locations.list.mockRejectedValue(new Error("401 Unauthorized"));
    const out = await testSquareConnection(row());
    expect(out.ok).toBe(false);
    expect(out.detail).toMatch(/Unauthorized/);
  });
});

describe("createSquarePaymentLink", () => {
  it("throws when no location is configured", async () => {
    await expect(
      createSquarePaymentLink(
        row({ config: { locationId: null, applicationId: null, webhookUrl: null } }),
        { name: "INV", amountCents: 1000 }
      )
    ).rejects.toThrow(/location/i);
  });

  it("maps the SDK response to url/orderId/paymentLinkId", async () => {
    mockClient.checkout.paymentLinks.create.mockResolvedValue({
      paymentLink: { id: "PL1", url: "https://sq/checkout/PL1", orderId: "ORD1" },
    });
    const out = await createSquarePaymentLink(row(), { name: "INV-1 — Balance", amountCents: 2500 });
    expect(out).toEqual({ url: "https://sq/checkout/PL1", orderId: "ORD1", paymentLinkId: "PL1" });
    // amount is sent as a BigInt in cents
    const arg = mockClient.checkout.paymentLinks.create.mock.calls[0][0];
    expect(arg.quickPay.priceMoney.amount).toBe(BigInt(2500));
    expect(arg.quickPay.locationId).toBe("LOC1");
  });

  it("throws when Square returns no link", async () => {
    mockClient.checkout.paymentLinks.create.mockResolvedValue({ paymentLink: undefined });
    await expect(
      createSquarePaymentLink(row(), { name: "INV", amountCents: 1000 })
    ).rejects.toThrow(/did not return/i);
  });
});

describe("verifySquareWebhook", () => {
  it("returns true when the SDK verifies the signature", async () => {
    (WebhooksHelper.verifySignature as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const ok = await verifySquareWebhook({ body: "{}", signature: "sig", signatureKey: "k", notificationUrl: "u" });
    expect(ok).toBe(true);
  });

  it("returns false when the SDK rejects", async () => {
    (WebhooksHelper.verifySignature as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const ok = await verifySquareWebhook({ body: "{}", signature: "bad", signatureKey: "k", notificationUrl: "u" });
    expect(ok).toBe(false);
  });

  it("returns false (not throw) when the SDK throws", async () => {
    (WebhooksHelper.verifySignature as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    const ok = await verifySquareWebhook({ body: "{}", signature: "x", signatureKey: "", notificationUrl: "u" });
    expect(ok).toBe(false);
  });
});
