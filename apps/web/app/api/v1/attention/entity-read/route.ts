import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { markEntityAttentionRead, ATTENTION_ENTITY_TYPES } from "@/lib/attention";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  entityType: z.enum(ATTENTION_ENTITY_TYPES),
  entityId: z.string().uuid(),
});

/**
 * POST /api/v1/attention/entity-read
 * Mark all unread attention events for an entity as read.
 * Call from a client component after real navigation (not RSC prefetch).
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

  try {
    const n = await withDbSession(session, (client) =>
      markEntityAttentionRead(
        client,
        session.accountId,
        parsed.data.entityType,
        parsed.data.entityId,
      ),
    );
    return NextResponse.json({ data: { ok: true, marked: n } });
  } catch (error) {
    logger.error("POST /api/v1/attention/entity-read", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Failed to mark entity read", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
