import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withDocumentContext, listDocumentLinks, createDocumentLink } from "@/lib/paperless/db";
import { appendAuditLog } from "@/lib/db/audit";
import { documentLinkEntityTypeSchema } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/documents?entity_type=expense&entity_id=<uuid>
//
// List all document links for an entity.  Any authenticated role can read.
// Returns { links: DocumentLinkRow[] }
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  entity_type: documentLinkEntityTypeSchema,
  entity_id: z.string().uuid("entity_id must be a UUID"),
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
          message: "entity_type and entity_id (UUID) are required",
          details: { issues: parsed.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { entity_type, entity_id } = parsed.data;

  try {
    const links = await withDocumentContext(session, (client) =>
      listDocumentLinks(client, session.accountId, entity_type, entity_id)
    );
    return NextResponse.json({ links });
  } catch (error) {
    logger.error("GET /api/v1/documents error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch document links",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/documents
//
// Link an existing Paperless document to an ai-fsm entity.
// Owner and admin only.
//
// Body: { entity_type, entity_id, paperless_doc_id, title?, original_filename? }
// Returns 201 { link: DocumentLinkRow } or 409 if already linked.
// ---------------------------------------------------------------------------

const createBodySchema = z.object({
  entity_type: documentLinkEntityTypeSchema,
  entity_id: z.string().uuid("entity_id must be a UUID"),
  paperless_doc_id: z.number().int().positive("paperless_doc_id must be a positive integer"),
  title: z.string().max(500).nullable().optional(),
  original_filename: z.string().max(500).nullable().optional(),
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: { code: "PARSE_ERROR", message: "Invalid JSON body", traceId: session.traceId },
      },
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

  const { entity_type, entity_id, paperless_doc_id, title, original_filename } = parsed.data;

  try {
    const link = await withDocumentContext(session, async (client) => {
      const created = await createDocumentLink(client, session.accountId, {
        entityType: entity_type,
        entityId: entity_id,
        paperlessDocId: paperless_doc_id,
        title: title ?? null,
        originalFilename: original_filename ?? null,
        createdBy: session.userId,
      });

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "document_link",
        entity_id: created.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: {
          entity_type,
          entity_id,
          paperless_doc_id,
          title: title ?? null,
        },
      });

      return created;
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (error: unknown) {
    // PostgreSQL UNIQUE_VIOLATION = 23505
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_LINKED",
            message: "This Paperless document is already linked to this record",
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }

    logger.error("POST /api/v1/documents error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create document link",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
