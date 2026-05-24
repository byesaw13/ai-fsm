import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import {
  getEstimateById,
  updateEstimateById,
  deleteEstimateById,
} from "@/lib/estimates/repository";
import {
  estimateAdjustmentTypeSchema,
  estimateFinishExpectationSchema,
  estimateMinimumOverrideReasonSchema,
  estimateTripCountSchema,
} from "@ai-fsm/domain";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

// === Get Estimate (GET /api/v1/estimates/[id]) ===

export const GET = withAuth(async (request: NextRequest, session) => {
  const id = getPathId(request.nextUrl.pathname);

  try {
    const data = await withEstimateContext(session, (client) =>
      getEstimateById(client, id, session.accountId)
    );

    if (!data) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("GET /api/v1/estimates/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to fetch estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

// === Update Estimate (PATCH /api/v1/estimates/[id]) ===

const lineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  line_item_type: z.enum(["labor", "materials", "handling_fee", "adjustment"]).default("labor"),
  visible_to_customer: z.boolean().default(true),
  adjustment_type: estimateAdjustmentTypeSchema.nullable().optional(),
  sort_order: z.number().int().default(0),
});

const estimateOptionInputSchema = z.object({
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  line_items: z.array(lineItemInputSchema).default([]),
  is_recommended: z.boolean().default(false),
});

const patchEstimateSchema = z.object({
  client_id: z.string().uuid().optional(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  tax_rate: z.number().min(0).max(100).optional(),
  line_items: z.array(lineItemInputSchema).optional(),
  flat_rate_cents: z.number().int().nonnegative().optional(),
  presentation_mode: z.enum(["standard", "multi_option"]).optional(),
  options: z.array(estimateOptionInputSchema).optional(),
  sq_ft: z.number().positive().optional(),
  prep_level: z.number().int().min(1).max(10).optional(),
  includes_trim: z.boolean().optional(),
  includes_ceiling: z.boolean().optional(),
  material_cost_cents: z.number().int().nonnegative().optional(),
  labor_hours_estimate: z.number().positive().optional(),
  trip_count: estimateTripCountSchema.optional(),
  requires_drying_or_curing: z.boolean().optional(),
  difficult_access: z.boolean().optional(),
  old_house_risk: z.boolean().optional(),
  coordination_required: z.boolean().optional(),
  finish_expectation: estimateFinishExpectationSchema.optional(),
  travel_surcharge_cents: z.number().int().nonnegative().optional(),
  risk_adjustment_cents: z.number().int().nonnegative().optional(),
  minimum_service_override_reason: estimateMinimumOverrideReasonSchema.nullable().optional(),
  minimum_service_override_note: z.string().nullable().optional(),
});

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const id = getPathId(request.nextUrl.pathname);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body", traceId: session.traceId } },
      { status: 400 }
    );
  }

  const parseResult = patchEstimateSchema.safeParse(body);
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
    const result = await withEstimateContext(session, (client) =>
      updateEstimateById(client, id, session, parseResult.data)
    );
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_ENTITY", message: err.message, traceId: session.traceId } },
        { status: 422 }
      );
    }
    logger.error("PATCH /api/v1/estimates/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to update estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});

// === Delete Estimate (DELETE /api/v1/estimates/[id]) ===

export const DELETE = withRole(["owner"], async (request: NextRequest, session) => {
  const id = getPathId(request.nextUrl.pathname);

  try {
    await withEstimateContext(session, (client) =>
      deleteEstimateById(client, id, session)
    );
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } },
        { status: 404 }
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_ENTITY", message: err.message, traceId: session.traceId } },
        { status: 422 }
      );
    }
    logger.error("DELETE /api/v1/estimates/[id] error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to delete estimate", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
