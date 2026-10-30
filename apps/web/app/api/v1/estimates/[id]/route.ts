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
  lineItemTypeSchema,
} from "@ai-fsm/domain";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";
import { linePriceMissing } from "@/lib/estimates/cost-split";
import { HOUR_SOURCES } from "@/lib/estimates/stored-hours";
import { assertQuoteVersion, quoteUpdatedAt } from "@/lib/estimates/quote-version";

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
  unit_price_cents: z.number().int().nonnegative().optional(),
  unit_cost_cents: z.number().int().nonnegative().nullable().optional(),
  hours_low: z.number().nonnegative().nullable().optional(),
  hours_high: z.number().nonnegative().nullable().optional(),
  hours_source: z.enum(HOUR_SOURCES).nullable().optional(),
  line_item_type: lineItemTypeSchema.default("labor"),
  visible_to_customer: z.boolean().default(true),
  adjustment_type: estimateAdjustmentTypeSchema.nullable().optional(),
  sort_order: z.number().int().default(0),
  price_book_id: z.string().uuid().nullable().optional(),
  prepared_group_key: z.string().max(60).nullable().optional(),
}).superRefine((item, ctx) => {
  if (linePriceMissing(item)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a price, or a cost on a materials line",
      path: ["unit_price_cents"],
    });
  }
  if (
    item.hours_low != null &&
    item.hours_high != null &&
    item.hours_low > item.hours_high
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hours low cannot be above high",
      path: ["hours_low"],
    });
  }
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
  deposit_required: z.boolean().optional(),
  deposit_type: z.enum(["none", "materials", "percentage", "fixed"]).optional(),
  deposit_percentage: z.number().min(0).max(100).nullable().optional(),
  deposit_fixed_cents: z.number().int().nonnegative().nullable().optional(),
  deposit_due_trigger: z.enum(["on_acceptance", "before_scheduling", "before_material_order", "custom"]).optional(),
  terms_scope_accepted: z.boolean().optional(),
  terms_payment_accepted: z.boolean().optional(),
  terms_change_order_accepted: z.boolean().optional(),
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
  labor_hours_low: z.number().nonnegative().nullable().optional(),
  labor_hours_high: z.number().nonnegative().nullable().optional(),
  labor_hours_source: z.enum(HOUR_SOURCES).nullable().optional(),
  direct_costs_confirmed: z.boolean().optional(),
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
  scope_assumptions: z.string().nullable().optional(),
  room_specs: z.array(z.record(z.unknown())).optional(),
  shopping_list_json: z.record(z.unknown()).optional(),
  updated_at: z.string().min(1).max(80).optional(),
}).superRefine((input, ctx) => {
  if (
    input.labor_hours_low != null &&
    input.labor_hours_high != null &&
    input.labor_hours_low > input.labor_hours_high
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hours low cannot be above high",
      path: ["labor_hours_low"],
    });
  }
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

  const { updated_at: loadedUpdatedAt, ...patch } = parseResult.data;
  const replacesLines = patch.line_items !== undefined || patch.options !== undefined;
  if (replacesLines && loadedUpdatedAt === undefined) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", traceId: session.traceId } },
      { status: 400 },
    );
  }

  try {
    const result = await withEstimateContext(session, async (client) => {
      if (loadedUpdatedAt !== undefined) {
        const { rows } = await client.query<{ updated_at: Date }>(
          `SELECT updated_at FROM estimates WHERE id = $1 AND account_id = $2 FOR UPDATE`,
          [id, session.accountId],
        );
        if (!rows[0]) throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
        assertQuoteVersion(rows[0].updated_at, loadedUpdatedAt);
      }
      await updateEstimateById(client, id, session, patch);
      const { rows } = await client.query<{ updated_at: Date }>(
        `SELECT updated_at FROM estimates WHERE id = $1`,
        [id],
      );
      return { updated: true, updated_at: quoteUpdatedAt(rows[0]?.updated_at) };
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "STALE_QUOTE") {
      return NextResponse.json(
        { error: { code: "STALE_QUOTE", message: err.message, traceId: session.traceId } },
        { status: 409 },
      );
    }
    if (err.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }
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
