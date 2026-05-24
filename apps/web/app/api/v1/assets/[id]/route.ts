import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withAssetContext, deleteAssetLink, updateAssetLinkStatus } from "@/lib/homebox/db";
import { appendAuditLog } from "@/lib/db/audit";
import { assetLinkStatusSchema } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();

function extractId(request: NextRequest): string | null {
  const raw = getPathId(request.nextUrl.pathname);
  return uuidSchema.safeParse(raw).success ? raw : null;
}

// DELETE /api/v1/assets/[id]
export const DELETE = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = extractId(request);
  if (!id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid asset link ID", traceId: session.traceId } },
      { status: 400 }
    );
  }

  try {
    const deleted = await withAssetContext(session, async (client) => {
      const ok = await deleteAssetLink(client, session.accountId, id);
      if (ok) {
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "asset_link",
          entity_id: id,
          action: "delete",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: { id },
        });
      }
      return ok;
    });

    if (!deleted) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Asset link not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("DELETE /api/v1/assets/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete asset link", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

// PATCH /api/v1/assets/[id]
// Body: { status: "planned" | "on_site" | "returned" }
const patchBodySchema = z.object({ status: assetLinkStatusSchema });

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = extractId(request);
  if (!id) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid asset link ID", traceId: session.traceId } },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "PARSE_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parsed = patchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "status must be planned | on_site | returned",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    const link = await withAssetContext(session, async (client) => {
      const updated = await updateAssetLinkStatus(client, session.accountId, id, parsed.data.status);
      if (updated) {
        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "asset_link",
          entity_id: id,
          action: "update",
          actor_id: session.userId,
          trace_id: session.traceId,
          new_value: { status: parsed.data.status },
        });
      }
      return updated;
    });

    if (!link) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Asset link not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    return NextResponse.json({ link });
  } catch (error) {
    logger.error("PATCH /api/v1/assets/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update asset link", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
