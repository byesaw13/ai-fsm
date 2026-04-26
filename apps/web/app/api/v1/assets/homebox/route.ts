import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { isHomeboxEnabled, searchHomeboxItems, fetchHomeboxItem } from "@/lib/homebox/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/assets/homebox?q=<search>
// GET /api/v1/assets/homebox?id=<uuid>
//
// Proxy for Homebox item search/lookup. Owner and admin only.
// Returns { enabled: false } when Homebox is not configured.

const querySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  id: z.string().uuid().optional(),
});

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  if (!isHomeboxEnabled()) {
    return NextResponse.json({ enabled: false, results: [], item: null });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    id: searchParams.get("id") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide either ?q=<search> or ?id=<uuid>",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { q, id } = parsed.data;

  if (!q && !id) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide either ?q=<search> or ?id=<uuid>",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    if (id) {
      const item = await fetchHomeboxItem(id);
      return NextResponse.json({ enabled: true, item, results: [] });
    }

    const result = await searchHomeboxItems(q!, 20);
    return NextResponse.json({
      enabled: true,
      item: null,
      results: result.items,
      total: result.total,
    });
  } catch (error) {
    logger.error("GET /api/v1/assets/homebox error", error, { traceId: session.traceId });
    return NextResponse.json({ enabled: true, results: [], item: null, total: 0 });
  }
});
