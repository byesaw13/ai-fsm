/**
 * POST /api/v1/visits/[id]/prepare-quote — Prepare Quote (TASK-179).
 *
 * Builds a draft estimate from the visit's saved assessment, or returns the
 * visit's open draft if one exists (one open draft per visit, migration 204).
 * The model lists the work; quantities, starting hours and prices are set in
 * code. If the model is unavailable the draft still opens with the rooms and
 * measurements and a visible notice.
 */
import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { withEstimateContext } from "@/lib/estimates/db";
import { loadAssessmentSummary } from "@/lib/estimates/assessment-summary-loader";
import { createEstimate, createEstimateSchema } from "@/lib/estimates/create-estimate";
import {
  extractPreparedScope,
  fallbackPreparedScope,
  preparedScopeInternalNote,
  preparedScopeToLineItems,
  toPreparedScope,
  type PriceBookHours,
} from "@/lib/estimates/prepare-quote";
import { resolveLaborRateCents } from "@/lib/estimates/tm-briefing";
import { loadPricingSettings } from "@/lib/pricing/settings";

export const dynamic = "force-dynamic";

function extractVisitId(url: string) {
  return url.match(/\/visits\/([^/]+)\/prepare-quote/)?.[1] ?? null;
}

function errorResponse(session: AuthSession, status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, traceId: session.traceId } }, { status });
}

async function findOpenDraft(session: AuthSession, visitId: string): Promise<string | null> {
  return withEstimateContext(session, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM estimates
       WHERE account_id = $1 AND source_visit_id = $2 AND status = 'draft'
       LIMIT 1`,
      [session.accountId, visitId],
    );
    return rows[0]?.id ?? null;
  });
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const visitId = extractVisitId(request.url);
  if (!visitId) return errorResponse(session, 400, "VALIDATION_ERROR", "Missing visit id");

  try {
    const existing = await findOpenDraft(session, visitId);
    if (existing) return NextResponse.json({ id: existing, resumed: true }, { status: 200 });

    const summary = await loadAssessmentSummary(session, visitId);
    if (!summary) return errorResponse(session, 404, "NO_ASSESSMENT", "Save the assessment before preparing a quote");

    const context = await withEstimateContext(session, async (client) => {
      const { rows } = await client.query<{
        job_id: string;
        client_id: string;
        property_id: string | null;
        property_state: string | null;
        assessment_updated_at: string | null;
      }>(
        `SELECT j.id AS job_id, j.client_id, j.property_id, p.state AS property_state,
                a.updated_at::text AS assessment_updated_at
         FROM visits v
         JOIN jobs j ON j.id = v.job_id AND j.account_id = v.account_id
         LEFT JOIN properties p ON p.id = j.property_id
         LEFT JOIN site_visit_assessments a ON a.visit_id = v.id AND a.account_id = v.account_id
         WHERE v.id = $1 AND v.account_id = $2`,
        [visitId, session.accountId],
      );
      if (!rows[0]) return null;
      const settings = await loadPricingSettings(client, session.accountId);
      const { rows: priceBook } = await client.query<PriceBookHours>(
        `SELECT code, name,
                labor_hours_low::float AS labor_hours_low,
                labor_hours_typical::float AS labor_hours_typical,
                labor_hours_high::float AS labor_hours_high
         FROM price_book WHERE is_active = true ORDER BY code`,
      );
      return { ...rows[0], settings, priceBook };
    });
    if (!context) return errorResponse(session, 404, "NOT_FOUND", "Visit not found");

    const source = { visitId, assessmentUpdatedAt: context.assessment_updated_at };
    let ai: "ok" | "unavailable" = "ok";
    let scope;
    try {
      const output = await extractPreparedScope(summary, context.priceBook);
      scope = output ? toPreparedScope(output, summary, context.priceBook, source) : null;
    } catch (err) {
      logger.warn("prepare-quote: AI preparation failed", { visitId, error: (err as Error).message });
      scope = null;
    }
    if (!scope) {
      ai = "unavailable";
      scope = fallbackPreparedScope(summary, source);
    }

    const { labor_rate_cents } = resolveLaborRateCents(context.property_state, context.settings);
    const { lineItems, groupKeys } = preparedScopeToLineItems(scope, labor_rate_cents);
    const input = createEstimateSchema.parse({
      client_id: context.client_id,
      job_id: context.job_id,
      property_id: context.property_id,
      pricing_mode: "hourly_internal",
      line_items: lineItems,
      internal_notes: preparedScopeInternalNote(scope, labor_rate_cents),
      scope_assumptions: scope.exclusions.length ? `Not included: ${scope.exclusions.join("; ")}` : null,
    });

    try {
      const { id } = await createEstimate(session, input, {
        sourceVisitId: visitId,
        preparedScope: scope,
        lineGroupKeys: groupKeys,
      });
      return NextResponse.json({ id, resumed: false, ai }, { status: 201 });
    } catch (err) {
      // Another request created the draft first (one open draft per visit).
      if ((err as { code?: string }).code === "23505") {
        const raced = await findOpenDraft(session, visitId);
        if (raced) return NextResponse.json({ id: raced, resumed: true }, { status: 200 });
      }
      throw err;
    }
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") return errorResponse(session, 404, "NOT_FOUND", err.message);
    logger.error("POST /api/v1/visits/[id]/prepare-quote error", error, { traceId: session.traceId, visitId });
    return errorResponse(session, 500, "INTERNAL_ERROR", "Failed to prepare the quote");
  }
});
