import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import {
  isPaperlessEnabled,
  searchPaperlessDocuments,
  fetchPaperlessDocument,
} from "@/lib/paperless/client";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/documents/paperless?q=<search>&id=<docId>
//
// Proxy endpoint for Paperless-ngx queries.
// Owner and admin only (prevents tech role from browsing all documents).
//
// Modes:
//   ?q=invoice receipt        → searchPaperlessDocuments(q)
//   ?id=42                    → fetchPaperlessDocument(42)
//
// If Paperless is not configured, returns { enabled: false, results: [] }.
// If Paperless is unavailable, returns gracefully degraded empty response.
// ---------------------------------------------------------------------------

const searchQuerySchema = z.object({
  q: z.string().min(1).max(200).optional(),
  id: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : undefined))
    .pipe(z.number().int().positive().optional()),
});

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  if (!isPaperlessEnabled()) {
    return NextResponse.json({ enabled: false, results: [], document: null });
  }

  const { searchParams } = new URL(request.url);
  const parsed = searchQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    id: searchParams.get("id") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide either ?q=<search> or ?id=<docId>",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { q, id } = parsed.data;

  if (!q && id === undefined) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Provide either ?q=<search> or ?id=<docId>",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    // Single document fetch
    if (id !== undefined) {
      const document = await fetchPaperlessDocument(id);
      return NextResponse.json({ enabled: true, document, results: [] });
    }

    // Search
    const searchResult = await searchPaperlessDocuments(q!, 20);
    return NextResponse.json({
      enabled: true,
      document: null,
      results: searchResult.results.map((doc) => ({
        id: doc.id,
        title: doc.title,
        original_file_name: doc.original_file_name,
        created: doc.created,
      })),
      count: searchResult.count,
    });
  } catch (error) {
    logger.error("GET /api/v1/documents/paperless error", error, { traceId: session.traceId });
    // Graceful degradation — Paperless unavailable is not a 500 from ai-fsm's perspective
    return NextResponse.json({ enabled: true, results: [], document: null, count: 0 });
  }
});
