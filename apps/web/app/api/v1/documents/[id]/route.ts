import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withDocumentContext, getDocumentLink, deleteDocumentLink } from "@/lib/paperless/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// DELETE /api/v1/documents/[id]
//
// Unlink a Paperless document from an ai-fsm record.
// Owner and admin only.  Returns 204 on success, 404 if not found.
// ---------------------------------------------------------------------------

export const DELETE = withRole(
  ["owner", "admin"],
  async (request: NextRequest, session) => {
    const url = new URL(request.url);
    const id = url.pathname.split("/").at(-1) ?? "";

    if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid document link ID",
            traceId: session.traceId,
          },
        },
        { status: 400 }
      );
    }

    try {
      return await withDocumentContext(session, async (client) => {
        const existing = await getDocumentLink(client, session.accountId, id);
        if (!existing) {
          return NextResponse.json(
            {
              error: {
                code: "NOT_FOUND",
                message: "Document link not found",
                traceId: session.traceId,
              },
            },
            { status: 404 }
          );
        }

        await deleteDocumentLink(client, session.accountId, id);

        await appendAuditLog(client, {
          account_id: session.accountId,
          entity_type: "document_link",
          entity_id: id,
          action: "delete",
          actor_id: session.userId,
          trace_id: session.traceId,
          old_value: {
            entity_type: existing.entity_type,
            entity_id: existing.entity_id,
            paperless_doc_id: existing.paperless_doc_id,
          },
        });

        return new NextResponse(null, { status: 204 });
      });
    } catch (error) {
      logger.error("DELETE /api/v1/documents/[id] error", error, { traceId: session.traceId });
      return NextResponse.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete document link",
            traceId: session.traceId,
          },
        },
        { status: 500 }
      );
    }
  }
);
