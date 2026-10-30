/**
 * POST /api/v1/estimates/[id]/prepared-scope/materials — itemize materials per
 * work area (TASK-187).
 *
 * Saves the owner's current edits, then lists materials for each requested
 * group with the existing materials generator (saved prices first, everything
 * else labeled as an estimate) and stores the lists on the prepared scope.
 * `clear` removes a group's list so it goes back to the task allowances.
 * The quote's lines and the buy list change when the owner presses Apply.
 * Draft estimates only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";
import { withEstimateContext } from "@/lib/estimates/db";
import { loadAssessmentSummary } from "@/lib/estimates/assessment-summary-loader";
import { applyScopeEdits } from "@/lib/estimates/prepare-quote";
import { itemizeGroups } from "@/lib/estimates/itemize-materials";
import { generateMaterials, MaterialsGenerationError, type SavedMaterial } from "@/lib/estimates/materials-generator";
import { parsePreparedScope, type PreparedScope } from "@ai-fsm/domain";
import { assertQuoteVersion, quoteUpdatedAt } from "@/lib/estimates/quote-version";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prepared_scope: z.unknown(),
  group_keys: z.array(z.string().max(60)).max(50).default([]),
  clear: z.array(z.string().max(60)).max(50).default([]),
  updated_at: z.string().min(1).max(80),
});

function errorResponse(session: AuthSession, status: number, code: string, message: string, updatedAt = "") {
  return NextResponse.json(
    { error: { code, message, traceId: session.traceId }, ...(updatedAt ? { updated_at: updatedAt } : {}) },
    { status },
  );
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

type Client = { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> };

async function lockedMerge(
  client: Client,
  session: AuthSession,
  id: string,
  incoming: PreparedScope,
  expectedUpdatedAt: string,
): Promise<PreparedScope> {
  const { rows } = await client.query<{ status: string; prepared_scope: unknown; updated_at: Date }>(
    `SELECT status, prepared_scope, updated_at FROM estimates WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [id, session.accountId],
  );
  const est = rows[0];
  if (!est) fail("NOT_FOUND", "Estimate not found");
  assertQuoteVersion(est.updated_at, expectedUpdatedAt);
  if (est.status !== "draft") fail("IMMUTABLE_ENTITY", "Only a draft quote can be changed");
  const stored = parsePreparedScope(est.prepared_scope);
  if (!stored) fail("NO_PREPARED_SCOPE", "This quote has no prepared scope");
  return applyScopeEdits(stored, incoming);
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname.replace(/\/prepared-scope\/materials$/, ""));

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid request body");
  }
  const incoming = parsePreparedScope(body.prepared_scope);
  if (!incoming) return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid prepared scope");
  if (body.group_keys.length === 0 && body.clear.length === 0) {
    return errorResponse(session, 400, "VALIDATION_ERROR", "Choose a work area");
  }

  try {
    // Save edits (and clear lists) first, so nothing typed is lost while the lists generate.
    const { merged, saved, updatedAt: savedAt } = await withEstimateContext(session, async (client) => {
      const merged = await lockedMerge(client, session, id, incoming, body.updated_at);
      if (body.clear.length > 0 && merged.materials) {
        const materials = { ...merged.materials };
        for (const key of body.clear) delete materials[key];
        merged.materials = materials;
      }
      const wrote = await client.query<{ updated_at: Date }>(
        `UPDATE estimates SET prepared_scope = $1 WHERE id = $2 RETURNING updated_at`,
        [JSON.stringify(merged), id],
      );
      const { rows: saved } = await client.query<SavedMaterial>(
        `SELECT id, name, brand, category, unit, unit_cost_cents, supplier
         FROM materials_price_book
         WHERE account_id = $1 AND is_active = true
         ORDER BY name`,
        [session.accountId],
      );
      return { merged, saved, updatedAt: quoteUpdatedAt(wrote.rows[0]?.updated_at) || body.updated_at };
    });
    if (body.group_keys.length === 0) {
      return NextResponse.json({ prepared_scope: merged, failed: [], updated_at: savedAt });
    }

    const summary = await loadAssessmentSummary(session, merged.source.visit_id);
    if (!summary) return errorResponse(session, 400, "NO_ASSESSMENT", "The assessment this quote came from is gone");

    const result = await itemizeGroups(merged, summary, body.group_keys, saved, generateMaterials);
    if (result.failed.length === body.group_keys.length) {
      const reason = result.failed[0]?.message ?? "Materials could not be listed";
      return errorResponse(session, 503, "AI_UNAVAILABLE", `${reason} Your edits are saved.`, savedAt);
    }

    // Store only the new lists on the latest saved scope. Check the timestamp
    // this request just wrote, so a change during generation is not overwritten.
    const final = await withEstimateContext(session, async (client) => {
      const current = await lockedMerge(client, session, id, merged, savedAt);
      const materials = { ...(current.materials ?? {}) };
      for (const key of body.group_keys) {
        const list = result.scope.materials?.[key];
        if (list) materials[key] = list;
      }
      const next = { ...current, materials };
      const wrote = await client.query<{ updated_at: Date }>(
        `UPDATE estimates SET prepared_scope = $1 WHERE id = $2 RETURNING updated_at`,
        [JSON.stringify(next), id],
      );
      return { scope: next, updatedAt: quoteUpdatedAt(wrote.rows[0]?.updated_at) || savedAt };
    });
    return NextResponse.json({ prepared_scope: final.scope, failed: result.failed, updated_at: final.updatedAt });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") return errorResponse(session, 404, "NOT_FOUND", err.message);
    if (err.code === "STALE_QUOTE") return errorResponse(session, 409, "STALE_QUOTE", err.message);
    if (err.code === "VALIDATION_ERROR") return errorResponse(session, 400, "VALIDATION_ERROR", err.message);
    if (err.code === "IMMUTABLE_ENTITY") return errorResponse(session, 422, "IMMUTABLE_ENTITY", err.message);
    if (err.code === "NO_PREPARED_SCOPE") return errorResponse(session, 400, "NO_PREPARED_SCOPE", err.message);
    if (error instanceof MaterialsGenerationError) return errorResponse(session, error.status, error.code, error.message);
    logger.error("POST /api/v1/estimates/[id]/prepared-scope/materials error", error, { traceId: session.traceId, estimateId: id });
    return errorResponse(session, 500, "INTERNAL_ERROR", "Failed to itemize materials");
  }
});
