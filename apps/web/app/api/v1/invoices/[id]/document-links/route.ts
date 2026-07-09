import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@ai-fsm/log/web";

import {
  assertClientInAccount,
  assertJobForClient,
  assertPropertyForClient,
  createPropertyForClient,
  documentLinksBodySchema,
  resolveDocumentLinkPatch,
} from "@/lib/documents/document-links";

export const dynamic = "force-dynamic";

export const PATCH = withRole(["owner", "admin"], async (request, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2) ?? "";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 },
    );
  }

  const parsed = documentLinksBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

  const input = parsed.data;
  if (!input.client_id && !input.location_mode && input.job_id === undefined && input.property_id === undefined && !input.new_property) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "No changes provided", traceId: session.traceId } },
      { status: 422 },
    );
  }

  try {
    const result = await withInvoiceContext(session, async (client) => {
      const existing = await client.query<{
        id: string;
        status: string;
        client_id: string;
        job_id: string | null;
        property_id: string | null;
      }>(
        `SELECT id, status, client_id, job_id, property_id
         FROM invoices WHERE id = $1 AND account_id = $2`,
        [id, session.accountId],
      );

      if (existing.rowCount === 0) {
        throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
      }

      const inv = existing.rows[0];
      if (inv.status === "void") {
        throw Object.assign(new Error("Void invoices cannot be edited"), { code: "IMMUTABLE_ENTITY" });
      }

      const targetClientId = input.client_id ?? inv.client_id;
      if (input.client_id) {
        await assertClientInAccount(client, session.accountId, input.client_id);
      }

      let jobPropertyId: string | null = null;
      if (input.location_mode === "job" || input.job_id) {
        const jobId = input.job_id ?? inv.job_id;
        if (!jobId) {
          throw Object.assign(new Error("Select a project to link"), { code: "VALIDATION_ERROR" });
        }
        const job = await assertJobForClient(client, session.accountId, jobId, targetClientId);
        jobPropertyId = job.property_id;
      }

      let createdPropertyId: string | null = null;
      if (input.new_property) {
        createdPropertyId = await createPropertyForClient(
          client,
          session.accountId,
          targetClientId,
          input.new_property,
        );
      }

      const patchInput = {
        ...input,
        property_id: createdPropertyId ?? input.property_id,
        job_id: input.location_mode === "job" ? (input.job_id ?? inv.job_id) : input.job_id,
      };

      const next = resolveDocumentLinkPatch(patchInput, inv, jobPropertyId);

      if (next.property_id) {
        await assertPropertyForClient(client, session.accountId, next.property_id, next.client_id);
      }
      if (next.job_id) {
        await assertJobForClient(client, session.accountId, next.job_id, next.client_id);
      }

      if (
        next.client_id === inv.client_id
        && next.job_id === inv.job_id
        && next.property_id === inv.property_id
      ) {
        return { updated: false, client_id: next.client_id, job_id: next.job_id, property_id: next.property_id };
      }

      await client.query(
        `UPDATE invoices
         SET client_id = $1, job_id = $2, property_id = $3, updated_at = now()
         WHERE id = $4 AND account_id = $5`,
        [next.client_id, next.job_id, next.property_id, id, session.accountId],
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: {
          client_id: inv.client_id,
          job_id: inv.job_id,
          property_id: inv.property_id,
        },
        new_value: next,
      });

      return { updated: true, ...next };
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found", traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "IMMUTABLE_ENTITY" || err.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 422 },
      );
    }
    logger.error("PATCH /api/v1/invoices/[id]/document-links error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update document links", traceId: session.traceId } },
      { status: 500 },
    );
  }
});