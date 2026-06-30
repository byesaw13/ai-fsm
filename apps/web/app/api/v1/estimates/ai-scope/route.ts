import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { translateScope } from "@/lib/estimates/scope";
import { formatCents } from "@/lib/estimates/pricing";
import { computeEstimate, sqftPaintingToSpec, CURRENT_RULES } from "@ai-fsm/domain";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const scopeBodySchema = z.object({
  notes: z.string().min(1, "Notes are required").max(5000),
});

/**
 * POST /api/v1/estimates/ai-scope
 *
 * Parse free-text customer notes into a structured estimate draft.
 * Returns parsed fields, a preview of the estimate, and confidence score.
 */
export const POST = withAuth(async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parseResult = scopeBodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  try {
    const { notes } = parseResult.data;
    const parsed = await translateScope(notes);

    // If it's a painting estimate and we have enough data, compute a preview
    let estimate_preview: Record<string, string> | null = null;
    if (parsed.suggested_job_type === "painting" && parsed.sq_ft !== null && parsed.prep_level !== null) {
      const hours = parsed.labor_hours_estimate ?? Math.round((parsed.sq_ft / 100) * 4 * 10) / 10;
      const engine = computeEstimate(
        sqftPaintingToSpec({
          sq_ft: parsed.sq_ft,
          prep_level: parsed.prep_level,
          includes_trim: parsed.includes_trim,
          includes_ceiling: parsed.includes_ceiling,
          material_cost_cents: parsed.material_cost_cents ?? 0,
          labor_hours_estimate: hours,
        }),
        CURRENT_RULES
      );
      estimate_preview = {
        labor: formatCents(engine.summary.laborCents),
        materials: parsed.material_cost_cents ? formatCents(parsed.material_cost_cents) : "Not specified",
        handling_fee: formatCents(engine.summary.handlingCents),
        total: formatCents(engine.summary.totalCents),
        deposit: formatCents(engine.summary.depositCents),
        balance: formatCents(engine.summary.balanceDueCents),
        estimated_hours: String(hours),
        margin_pct: `${Math.round(engine.internalSummary.grossMarginPct * 1000) / 10}%`,
      };
    }

    return NextResponse.json({
      parsed,
      estimate_preview,
    });
  } catch (error) {
    logger.error("POST /api/v1/estimates/ai-scope error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to parse scope", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
