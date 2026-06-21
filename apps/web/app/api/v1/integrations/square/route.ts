import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";
import { isEncryptionConfigured } from "@/lib/crypto";
import {
  loadSquareSettings,
  encryptSquareSecrets,
  type SquareSecrets,
} from "@/lib/integrations/square";
import { z } from "zod";

export const dynamic = "force-dynamic";

// === GET /api/v1/integrations/square — status + non-secret config (owner) ===
// Secrets are NEVER returned; only whether each is set.

export const GET = withRole(["owner"], async (_request, session) => {
  try {
    const data = await withDbSession(session, async (client) => {
      const row = await loadSquareSettings(client, session.accountId);
      if (!row) {
        return {
          configured: false,
          enabled: false,
          environment: "sandbox" as const,
          locationId: null,
          applicationId: null,
          hasAccessToken: false,
          hasWebhookSignatureKey: false,
          status: "disconnected" as const,
          statusDetail: null,
          lastCheckedAt: null,
          encryptionConfigured: isEncryptionConfigured(),
        };
      }
      return {
        configured: true,
        enabled: row.enabled,
        environment: row.environment,
        locationId: row.config.locationId,
        applicationId: row.config.applicationId,
        hasAccessToken: !!row.secrets.accessToken,
        hasWebhookSignatureKey: !!row.secrets.webhookSignatureKey,
        status: row.status,
        statusDetail: row.statusDetail,
        lastCheckedAt: row.lastCheckedAt,
        encryptionConfigured: isEncryptionConfigured(),
      };
    });
    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/integrations/square error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load Square settings",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === PUT /api/v1/integrations/square — upsert config + secrets (owner) ===

const putSchema = z.object({
  enabled: z.boolean(),
  environment: z.enum(["sandbox", "production"]),
  locationId: z.string().trim().max(64).nullable().optional(),
  applicationId: z.string().trim().max(128).nullable().optional(),
  // Secrets: only persisted when a non-empty value is supplied. Omit/empty to
  // keep the existing secret. Never echoed back by GET.
  accessToken: z.string().trim().max(512).optional(),
  webhookSignatureKey: z.string().trim().max(512).optional(),
});

export const PUT = withRole(["owner"], async (request, session) => {
  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "PRECONDITION_FAILED",
          message:
            "APP_ENCRYPTION_KEY is not configured — cannot store Square secrets",
          traceId: session.traceId,
        },
      },
      { status: 412 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const input = parsed.data;

  try {
    await withDbSession(session, async (client) => {
      const existing = await loadSquareSettings(client, session.accountId);

      // Merge secrets: keep existing unless a new non-empty value is provided.
      const secrets: SquareSecrets = {
        accessToken: existing?.secrets.accessToken ?? null,
        webhookSignatureKey: existing?.secrets.webhookSignatureKey ?? null,
      };
      if (input.accessToken) secrets.accessToken = input.accessToken;
      if (input.webhookSignatureKey)
        secrets.webhookSignatureKey = input.webhookSignatureKey;

      const config = {
        locationId: input.locationId ?? existing?.config.locationId ?? null,
        applicationId:
          input.applicationId ?? existing?.config.applicationId ?? null,
      };

      const encrypted = encryptSquareSecrets(secrets);

      await client.query(
        `INSERT INTO integration_settings
           (account_id, provider, enabled, environment, config, secrets, status, status_detail, last_checked_at)
         VALUES ($1, 'square', $2, $3, $4, $5, 'disconnected', NULL, NULL)
         ON CONFLICT (account_id, provider) DO UPDATE
           SET enabled = EXCLUDED.enabled,
               environment = EXCLUDED.environment,
               config = EXCLUDED.config,
               secrets = EXCLUDED.secrets,
               -- config changed → require a fresh connection test
               status = 'disconnected',
               status_detail = NULL`,
        [
          session.accountId,
          input.enabled,
          input.environment,
          JSON.stringify(config),
          encrypted,
        ]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "integration_settings",
        entity_id: session.accountId,
        action: existing ? "update" : "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          provider: "square",
          enabled: input.enabled,
          environment: input.environment,
          // never log secret values
          accessTokenSet: !!secrets.accessToken,
          webhookSignatureKeySet: !!secrets.webhookSignatureKey,
        },
      });
    });

    return NextResponse.json({ data: { saved: true } });
  } catch (error) {
    logger.error("PUT /api/v1/integrations/square error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to save Square settings",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
