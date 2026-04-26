import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withAssetContext, listAssetLinks, createAssetLink, getAssetLinkConflicts } from "@/lib/homebox/db";
import { appendAuditLog } from "@/lib/db/audit";
import { assetLinkEntityTypeSchema } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/assets?entity_type=job&entity_id=<uuid>
// Returns { links: AssetLinkRow[] }
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  entity_type: assetLinkEntityTypeSchema,
  entity_id: z.string().uuid(),
});

export const GET = withAuth(async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    entity_type: searchParams.get("entity_type") ?? undefined,
    entity_id: searchParams.get("entity_id") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "entity_type (job|visit) and entity_id (UUID) are required",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { entity_type, entity_id } = parsed.data;

  try {
    const links = await withAssetContext(session, (client) =>
      listAssetLinks(client, session.accountId, entity_type, entity_id)
    );
    return NextResponse.json({ links });
  } catch (error) {
    logger.error("GET /api/v1/assets error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch asset links", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/assets
// Body: { entity_type, entity_id, homebox_item_id, cached_name?, cached_location? }
// Returns 201 { link } | 409 already linked
// ---------------------------------------------------------------------------

const createBodySchema = z.object({
  entity_type: assetLinkEntityTypeSchema,
  entity_id: z.string().uuid(),
  homebox_item_id: z.string().uuid(),
  cached_name: z.string().max(500).nullable().optional(),
  cached_location: z.string().max(500).nullable().optional(),
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = createBodySchema.safeParse(body);
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

  const { entity_type, entity_id, homebox_item_id, cached_name, cached_location } = parsed.data;

  try {
    const { link, conflicts } = await withAssetContext(session, async (client) => {
      const existingConflicts = await getAssetLinkConflicts(
        client, session.accountId, homebox_item_id, entity_id
      );

      const created = await createAssetLink(client, session.accountId, {
        entityType: entity_type,
        entityId: entity_id,
        homeboxItemId: homebox_item_id,
        cachedName: cached_name ?? null,
        cachedLocation: cached_location ?? null,
        createdBy: session.userId,
      });

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "asset_link",
        entity_id: created.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { entity_type, entity_id, homebox_item_id, cached_name },
      });

      return { link: created, conflicts: existingConflicts };
    });

    return NextResponse.json({ link, conflicts }, { status: 201 });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: { code: "ALREADY_LINKED", message: "This asset is already linked to this record", traceId: session.traceId } },
        { status: 409 }
      );
    }

    logger.error("POST /api/v1/assets error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to create asset link", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
