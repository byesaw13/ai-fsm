/**
 * POST /api/v1/estimates/ai-materials
 * Generate a materials list from scope description + room measurements.
 * Matches items against the account's saved materials price book first;
 * falls back to Claude's market-rate estimates for new items.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";
import { generateMaterials } from "@/lib/estimates/materials-generator";
import type { RoomMeasurement, SavedMaterial } from "@/lib/estimates/materials-generator";
import {
  loadAssessmentSummary,
  loadAssessmentSummaryById,
} from "@/lib/estimates/assessment-summary-loader";
import type { AssessmentSummary } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const roomSchema = z.object({
  id: z.string(),
  name: z.string(),
  length_ft: z.number().nullable().default(null),
  width_ft: z.number().nullable().default(null),
  height_ft: z.number().nullable().default(null),
  notes: z.string().optional(),
});

// scope/job_type become optional when an assessment is supplied — they are
// derived from the persisted summary. assessment_id / visit_id load the
// canonical summary server-side; assessment_summary is a client-provided
// fallback (only used when neither id resolves).
const bodySchema = z.object({
  scope: z.string().max(5000).optional(),
  job_type: z.string().max(100).optional(),
  rooms: z.array(roomSchema).optional().default([]),
  assessment_id: z.string().uuid().optional(),
  visit_id: z.string().uuid().optional(),
  assessment_summary: z.unknown().optional(),
});

export const POST = withAuth(async (request: NextRequest, session: AuthSession) => {
  let body: unknown = {};
  try { body = await request.json(); } catch { /* ok */ }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues, traceId: session.traceId } },
      { status: 422 }
    );
  }

  // Resolve the canonical assessment summary, preferring persistence over any
  // client-provided fallback. visit_id wins, then assessment_id, then the
  // client-supplied summary (typed from the canonical contract).
  let summary: AssessmentSummary | null = null;
  try {
    if (parsed.data.visit_id) {
      summary = await loadAssessmentSummary(session, parsed.data.visit_id);
    } else if (parsed.data.assessment_id) {
      summary = await loadAssessmentSummaryById(session, parsed.data.assessment_id);
    }
  } catch (err) {
    logger.error("ai-materials: failed to load assessment summary", err, { traceId: session.traceId });
  }
  if (!summary && parsed.data.assessment_summary && typeof parsed.data.assessment_summary === "object") {
    summary = parsed.data.assessment_summary as AssessmentSummary;
  }

  // scope/job_type are derived from the assessment when not provided directly.
  const scope = (parsed.data.scope ?? "").trim() || summary?.generatedJobDescription || "";
  const jobType = (parsed.data.job_type ?? "").trim() || "general";
  if (scope.length < 3) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "A scope or an assessment with usable content is required", traceId: session.traceId } },
      { status: 422 }
    );
  }
  // Prefer rooms from the request; otherwise fall back to the assessment rooms.
  const rooms: RoomMeasurement[] =
    parsed.data.rooms.length > 0
      ? parsed.data.rooms
      : (summary?.rooms ?? []).map((r) => ({
          id: r.id,
          name: r.name,
          length_ft: r.length_ft,
          width_ft: r.width_ft,
          height_ft: r.height_ft,
          notes: r.notes,
        }));

  // Load the account's saved materials price book
  const savedRows = (await query(
    `SELECT id, name, brand, category, unit, unit_cost_cents, supplier
     FROM materials_price_book
     WHERE account_id = $1 AND is_active = true
     ORDER BY name`,
    [session.accountId]
  )) as unknown as SavedMaterial[];

  // Load account pricing settings (markup %)
  const accountRow = await query(
    `SELECT settings FROM accounts WHERE id = $1`,
    [session.accountId]
  );
  const settings = (accountRow[0]?.settings as Record<string, unknown>) ?? {};
  const materialMarkupPct = typeof settings.material_markup_pct === "number"
    ? settings.material_markup_pct
    : undefined;

  try {
    const result = await generateMaterials({
      scope,
      job_type: jobType,
      rooms,
      saved_materials: savedRows,
      material_markup_pct: materialMarkupPct,
      assessmentSummary: summary ?? undefined,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error("POST /api/v1/estimates/ai-materials error", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to generate materials list", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
