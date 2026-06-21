import { SquareClient, SquareEnvironment, WebhooksHelper } from "square";
import type { PoolClient } from "pg";
import { encryptJson, decryptJson } from "@/lib/crypto";
import { randomUUID } from "node:crypto";

// Provider module for Square card payments. Dovetails OS owns the invoice and
// payment record; Square only processes online card payments. All other
// providers (Stripe, PayPal) would get a sibling module under lib/integrations.

export type SquareEnvironmentName = "sandbox" | "production";

// Non-secret config stored in integration_settings.config (jsonb).
export interface SquarePublicConfig {
  locationId: string | null;
  applicationId: string | null;
}

// Secret material stored encrypted in integration_settings.secrets (bytea).
export interface SquareSecrets {
  accessToken: string | null;
  webhookSignatureKey: string | null;
}

export interface SquareSettings extends SquarePublicConfig, SquareSecrets {
  enabled: boolean;
  environment: SquareEnvironmentName;
}

export interface SquareSettingsRow {
  enabled: boolean;
  environment: SquareEnvironmentName;
  config: SquarePublicConfig;
  secrets: SquareSecrets;
  status: "disconnected" | "connected" | "error";
  statusDetail: string | null;
  lastCheckedAt: string | null;
}

/**
 * Load the account's Square settings, decrypting secrets. Returns null when no
 * row exists. Must be called within a session-scoped client (RLS owner-only).
 */
export async function loadSquareSettings(
  client: PoolClient,
  accountId: string
): Promise<SquareSettingsRow | null> {
  const result = await client.query<{
    enabled: boolean;
    environment: SquareEnvironmentName;
    config: SquarePublicConfig;
    secrets: Buffer | null;
    status: "disconnected" | "connected" | "error";
    status_detail: string | null;
    last_checked_at: string | null;
  }>(
    `SELECT enabled, environment, config, secrets, status, status_detail, last_checked_at
     FROM integration_settings
     WHERE account_id = $1 AND provider = 'square'`,
    [accountId]
  );
  if (result.rowCount === 0) return null;
  const row = result.rows[0];
  const secrets: SquareSecrets = row.secrets
    ? decryptJson<SquareSecrets>(row.secrets)
    : { accessToken: null, webhookSignatureKey: null };
  return {
    enabled: row.enabled,
    environment: row.environment,
    config: row.config ?? { locationId: null, applicationId: null },
    secrets,
    status: row.status,
    statusDetail: row.status_detail,
    lastCheckedAt: row.last_checked_at,
  };
}

/** Encrypt secrets for persistence. Exposed so the route stays free of crypto. */
export function encryptSquareSecrets(secrets: SquareSecrets): Buffer {
  return encryptJson(secrets);
}

function toSettings(row: SquareSettingsRow): SquareSettings {
  return {
    enabled: row.enabled,
    environment: row.environment,
    locationId: row.config.locationId,
    applicationId: row.config.applicationId,
    accessToken: row.secrets.accessToken,
    webhookSignatureKey: row.secrets.webhookSignatureKey,
  };
}

function buildClient(settings: SquareSettings): SquareClient {
  if (!settings.accessToken) {
    throw new Error("Square access token is not configured");
  }
  return new SquareClient({
    token: settings.accessToken,
    environment:
      settings.environment === "production"
        ? SquareEnvironment.Production
        : SquareEnvironment.Sandbox,
  });
}

/**
 * Verify the connection by listing locations. Returns a connected/error result
 * suitable for persisting to integration_settings.status.
 */
export async function testSquareConnection(
  row: SquareSettingsRow
): Promise<{ ok: boolean; detail: string }> {
  const settings = toSettings(row);
  if (!settings.accessToken) {
    return { ok: false, detail: "Access token is not set" };
  }
  try {
    const client = buildClient(settings);
    const res = await client.locations.list();
    const locations = res.locations ?? [];
    if (settings.locationId) {
      const found = locations.some((l) => l.id === settings.locationId);
      if (!found) {
        return {
          ok: false,
          detail: `Token is valid but location ${settings.locationId} was not found`,
        };
      }
    }
    return {
      ok: true,
      detail: `Connected — ${locations.length} location(s) available`,
    };
  } catch (err) {
    return { ok: false, detail: (err as Error).message };
  }
}

export interface CreatePaymentLinkInput {
  name: string;
  amountCents: number;
  idempotencyKey?: string;
}

export interface PaymentLinkResult {
  url: string;
  orderId: string | null;
  paymentLinkId: string;
}

/**
 * Create a Square-hosted Checkout payment link for a fixed amount (USD).
 */
export async function createSquarePaymentLink(
  row: SquareSettingsRow,
  input: CreatePaymentLinkInput
): Promise<PaymentLinkResult> {
  const settings = toSettings(row);
  if (!settings.locationId) {
    throw new Error("Square location ID is not configured");
  }
  const client = buildClient(settings);
  const res = await client.checkout.paymentLinks.create({
    idempotencyKey: input.idempotencyKey ?? randomUUID(),
    quickPay: {
      name: input.name,
      priceMoney: {
        amount: BigInt(input.amountCents),
        currency: "USD",
      },
      locationId: settings.locationId,
    },
  });
  const link = res.paymentLink;
  if (!link?.url || !link.id) {
    throw new Error("Square did not return a payment link");
  }
  return {
    url: link.url,
    orderId: link.orderId ?? null,
    paymentLinkId: link.id,
  };
}

/**
 * Fetch a payment's current state (used by the webhook to confirm completion).
 */
export async function getSquarePayment(
  row: SquareSettingsRow,
  paymentId: string
) {
  const client = buildClient(toSettings(row));
  const res = await client.payments.get({ paymentId });
  return res.payment ?? null;
}

/**
 * Verify a Square webhook signature. `notificationUrl` must exactly match the
 * endpoint URL registered in the Square dashboard.
 */
export async function verifySquareWebhook(opts: {
  body: string;
  signature: string;
  signatureKey: string;
  notificationUrl: string;
}): Promise<boolean> {
  try {
    return await WebhooksHelper.verifySignature({
      requestBody: opts.body,
      signatureHeader: opts.signature,
      signatureKey: opts.signatureKey,
      notificationUrl: opts.notificationUrl,
    });
  } catch {
    return false;
  }
}
