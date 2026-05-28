import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { createActionItem } from "@/lib/action-items";
import {
  withEstimateContext,
  calcTotals,
  lineItemTotal,
} from "@/lib/estimates/db";
import { calculatePaintingEstimate } from "@/lib/estimates/pricing";
import {
  estimateAdjustmentTypeSchema,
  estimateFinishExpectationSchema,
  estimateMinimumOverrideReasonSchema,
  estimateStatusSchema,
  estimateTripCountSchema,
  DEPOSIT_RATE,
} from "@ai-fsm/domain";
import { logger } from "@/lib/logger";
import { reviewEstimateGuardrails, computeConditionTier } from "@/lib/estimates/guardrails";
import { computeAndPersist } from "@/lib/estimates/compute";
import type { EstimateSpec } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// === List Estimates (GET /api/v1/estimates) ===

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: estimateStatusSchema.optional(),
  client_id: z.string().uuid().optional(),
  job_id: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const GET = withAuth(async (request, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = listQuerySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    client_id: searchParams.get("client_id") ?? undefined,
    job_id: searchParams.get("job_id") ?? undefined,
    page: searchParams.get("page") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { q, status, client_id, job_id, page, limit } = parseResult.data;
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ["e.account_id = $1"];
    const params: unknown[] = [session.accountId];
    let idx = 2;

    if (q) {
      const pattern = `%${q.toLowerCase()}%`;
      conditions.push(
        `(LOWER(c.name) LIKE $${idx} OR LOWER(COALESCE(e.notes, '')) LIKE $${idx})`
      );
      params.push(pattern);
      idx++;
    }
    if (status) {
      conditions.push(`e.status = $${idx++}`);
      params.push(status);
    }
    if (client_id) {
      conditions.push(`e.client_id = $${idx++}`);
      params.push(client_id);
    }
    if (job_id) {
      conditions.push(`e.job_id = $${idx++}`);
      params.push(job_id);
    }

    const where = conditions.join(" AND ");

    const countParams = [...params];
    const countResult = await withEstimateContext(session, async (client) => {
      const r = await client.query<{ total: string }>(
        `SELECT COUNT(*) AS total
         FROM estimates e
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE ${where}`,
        countParams
      );
      return r.rows[0]?.total ?? "0";
    });
    const total = parseInt(countResult, 10);

    params.push(limit, offset);
    const rows = await withEstimateContext(session, async (client) => {
      const r = await client.query(
        `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
                e.notes, e.internal_notes, e.sent_at, e.expires_at,
                e.client_id, e.job_id, e.property_id,
                e.created_by, e.created_at, e.updated_at,
                c.name AS client_name
         FROM estimates e
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE ${where}
         ORDER BY e.created_at DESC
         LIMIT $${idx} OFFSET $${idx + 1}`,
        params
      );
      return r.rows;
    });

    return NextResponse.json({
      data: rows,
      pagination: { page, limit, total },
    });
  } catch (error) {
    logger.error("GET /api/v1/estimates error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch estimates",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// === Create Estimate (POST /api/v1/estimates) ===

const lineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative(),
  line_item_type: z.enum(["labor", "materials", "handling_fee", "adjustment"]).default("labor"),
  visible_to_customer: z.boolean().default(true),
  adjustment_type: estimateAdjustmentTypeSchema.nullable().optional(),
  sort_order: z.number().int().default(0),
  price_book_id: z.string().uuid().nullable().optional(),
});

const estimateOptionInputSchema = z.object({
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  line_items: z.array(lineItemInputSchema).default([]),
  is_recommended: z.boolean().default(false),
});

const createEstimateSchema = z.object({
  client_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  vault_item_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  tax_rate: z.number().min(0).max(100).default(0),
  line_items: z.array(lineItemInputSchema).default([]),
  // Flat-rate mode: set this instead of line_items to store a single price with no breakdown
  flat_rate_cents: z.number().int().nonnegative().optional(),
  // Multi-option mode (Good/Better/Best)
  presentation_mode: z.enum(["standard", "multi_option"]).default("standard"),
  options: z.array(estimateOptionInputSchema).optional(),
  // Painting engine fields
  sq_ft: z.number().positive().optional(),
  prep_level: z.number().int().min(1).max(10).optional(),
  includes_trim: z.boolean().default(false),
  includes_ceiling: z.boolean().default(false),
  material_cost_cents: z.number().int().nonnegative().default(0),
  labor_hours_estimate: z.number().positive().optional(),
  // Pricing guardrails
  trip_count: estimateTripCountSchema.default("one_trip"),
  requires_drying_or_curing: z.boolean().default(false),
  difficult_access: z.boolean().default(false),
  old_house_risk: z.boolean().default(false),
  coordination_required: z.boolean().default(false),
  finish_expectation: estimateFinishExpectationSchema.default("clean"),
  travel_surcharge_cents: z.number().int().nonnegative().default(0),
  risk_adjustment_cents: z.number().int().nonnegative().default(0),
  minimum_service_override_reason: estimateMinimumOverrideReasonSchema.nullable().optional(),
  minimum_service_override_note: z.string().nullable().optional(),
  scope_assumptions: z.string().nullable().optional(),
  // Engine v2: room-by-room spec — when present, computeAndPersist() runs after insert
  engine_spec: z.record(z.unknown()).optional(),
  // Scope Intelligence: snapshot of components/complexity captured from ScopeBuilder per price-book item
  scope_snapshots: z
    .array(
      z.object({
        price_book_id: z.string().uuid().optional(),
        category: z.string(),
        components: z.record(z.unknown()).default({}),
        complexity: z.record(z.boolean()).default({}),
        computed_modifier: z.number().default(1.0),
        base_price_cents: z.number().int().nonnegative().optional(),
        adjusted_price_cents: z.number().int().nonnegative().optional(),
      })
    )
    .optional(),
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const parseResult = createEstimateSchema.safeParse(body);
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

  const {
    client_id,
    job_id,
    property_id,
    vault_item_id,
    notes,
    internal_notes,
    expires_at,
    tax_rate,
    line_items,
    flat_rate_cents,
    presentation_mode,
    options,
    sq_ft,
    prep_level,
    includes_trim,
    includes_ceiling,
    material_cost_cents,
    labor_hours_estimate,
    trip_count,
    requires_drying_or_curing,
    difficult_access,
    old_house_risk,
    coordination_required,
    finish_expectation,
    travel_surcharge_cents,
    risk_adjustment_cents,
    minimum_service_override_reason,
    minimum_service_override_note,
    scope_assumptions,
    engine_spec,
    scope_snapshots,
  } = parseResult.data;

  const is_painting = sq_ft !== undefined && prep_level !== undefined && labor_hours_estimate !== undefined;
  const is_multi_option = presentation_mode === "multi_option" && options && options.length > 0;

  if (is_multi_option && is_painting) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Painting estimates cannot use multi-option mode",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  let subtotal_cents: number;
  let computed_line_items = line_items;
  let internal_labor_cost_cents: number | null = null;
  let painting_margin_pct: number | null = null;

  if (is_painting) {
    const result = calculatePaintingEstimate({
      sq_ft,
      prep_level,
      includes_trim,
      includes_ceiling,
      material_cost_cents: material_cost_cents ?? 0,
      labor_hours_estimate,
    });
    subtotal_cents = result.total_cents;
    internal_labor_cost_cents = result.internal_labor_cost_cents;
    painting_margin_pct = result.gross_margin_pct / 100;
  } else if (is_multi_option) {
    subtotal_cents = 0;
  } else {
    subtotal_cents =
      flat_rate_cents !== undefined
        ? flat_rate_cents
        : calcTotals(line_items).subtotal_cents;
  }
  subtotal_cents += travel_surcharge_cents + risk_adjustment_cents;
  const tax_cents = Math.round((subtotal_cents * tax_rate) / 100);
  const total_cents = subtotal_cents + tax_cents;
  const deposit_cents = Math.round(total_cents * DEPOSIT_RATE);
  const balance_cents = total_cents - deposit_cents;
  const conditionTier = computeConditionTier({ old_house_risk, difficult_access, trip_count, requires_drying_or_curing, coordination_required });
  const pricingReview = reviewEstimateGuardrails({
    total_cents,
    trip_count,
    requires_drying_or_curing,
    difficult_access,
    old_house_risk,
    coordination_required,
    finish_expectation,
    travel_surcharge_cents,
    risk_adjustment_cents,
    minimum_service_override_reason: minimum_service_override_reason ?? null,
    margin_pct: painting_margin_pct,
    has_ma_regulated_items: false,
    line_item_count: line_items?.length ?? 0,
  });
  // In flat-rate mode, ignore any line_items that were mistakenly sent
  const itemsToInsert = flat_rate_cents !== undefined ? [] : line_items;

  try {
    const estimate = await withEstimateContext(session, async (client) => {
      // Verify client belongs to account
      const clientRow = await client.query<{ id: string; name: string }>(
        `SELECT id, name FROM clients WHERE id = $1 AND account_id = $2`,
        [client_id, session.accountId]
      );
      if (clientRow.rowCount === 0) {
        throw Object.assign(new Error("Client not found"), { code: "NOT_FOUND" });
      }
      const clientName = clientRow.rows[0].name;

      const result = await client.query<{ id: string }>(
        `INSERT INTO estimates
           (account_id, client_id, job_id, property_id, vault_item_id, status, presentation_mode,
            subtotal_cents, tax_cents, total_cents, deposit_cents, balance_cents,
            notes, internal_notes, expires_at, created_by,
            sq_ft, prep_level, includes_trim, includes_ceiling,
            internal_labor_cost_cents, internal_material_cost_cents,
            trip_count, requires_drying_or_curing, difficult_access, old_house_risk,
            coordination_required, finish_expectation, travel_surcharge_cents,
            risk_adjustment_cents, minimum_service_override_reason,
            minimum_service_override_note, pricing_review_status, scope_assumptions,
            condition_tier)
          VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                  $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
                  $28, $29, $30, $31, $32, $33, $34)
          RETURNING id`,
        [
          session.accountId,
          client_id,
          job_id ?? null,
          property_id ?? null,
          vault_item_id ?? null,
          is_multi_option ? "multi_option" : "standard",
          subtotal_cents,
          tax_cents,
          total_cents,
          deposit_cents,
          balance_cents,
          notes ?? null,
          internal_notes ?? null,
          expires_at ?? null,
          session.userId,
          sq_ft ?? null,
          prep_level ?? null,
          includes_trim ?? false,
          includes_ceiling ?? false,
          internal_labor_cost_cents,
          material_cost_cents ?? null,
          trip_count,
          requires_drying_or_curing,
          difficult_access,
          old_house_risk,
          coordination_required,
          finish_expectation,
          travel_surcharge_cents,
          risk_adjustment_cents,
          minimum_service_override_reason ?? null,
          minimum_service_override_note ?? null,
          pricingReview.status,
          scope_assumptions ?? null,
          conditionTier,
        ]
      );
      const estimateId = result.rows[0].id;

      if (is_multi_option && options) {
        // Create options with their line items
        for (let oi = 0; oi < options.length; oi++) {
          const option = options[oi];
          const optionSubtotal = calcTotals(option.line_items).subtotal_cents;
          const optionTax = Math.round((optionSubtotal * tax_rate) / 100);
          const optionTotal = optionSubtotal + optionTax;

          const optionResult = await client.query<{ id: string }>(
            `INSERT INTO estimate_options
               (estimate_id, label, description, sort_order, subtotal_cents, tax_cents, total_cents, is_recommended)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [estimateId, option.label, option.description ?? null, option.sort_order ?? oi, optionSubtotal, optionTax, optionTotal, option.is_recommended]
          );
          const optionId = optionResult.rows[0].id;

          for (let li = 0; li < option.line_items.length; li++) {
            const item = option.line_items[li];
            const itemTotal = lineItemTotal(item);
            await client.query(
              `INSERT INTO estimate_line_items
                 (estimate_id, option_id, description, quantity, unit_price_cents, total_cents,
                  line_item_type, visible_to_customer, adjustment_type, sort_order, price_book_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
              [
                estimateId,
                optionId,
                item.description,
                item.quantity,
                item.unit_price_cents,
                itemTotal,
                item.line_item_type,
                item.visible_to_customer,
                item.adjustment_type ?? null,
                item.sort_order ?? li,
                item.price_book_id ?? null,
              ]
            );
          }
        }
      } else {
        // Insert line items (skipped in flat-rate mode)
        for (let i = 0; i < itemsToInsert.length; i++) {
          const item = itemsToInsert[i];
          const itemTotal = lineItemTotal(item);
          await client.query(
            `INSERT INTO estimate_line_items
               (estimate_id, description, quantity, unit_price_cents, total_cents,
                line_item_type, visible_to_customer, adjustment_type, sort_order, price_book_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              estimateId,
              item.description,
              item.quantity,
              item.unit_price_cents,
              itemTotal,
              item.line_item_type,
              item.visible_to_customer,
              item.adjustment_type ?? null,
              item.sort_order ?? i,
              item.price_book_id ?? null,
            ]
          );
        }
      }

      // Scope snapshots
      if (scope_snapshots && scope_snapshots.length > 0) {
        for (const snap of scope_snapshots) {
          await client.query(
            `INSERT INTO estimate_scope_snapshots
               (estimate_id, category, components, complexity, computed_modifier, base_price_cents, adjusted_price_cents)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              estimateId,
              snap.category,
              JSON.stringify(snap.components),
              JSON.stringify(snap.complexity),
              snap.computed_modifier,
              snap.base_price_cents ?? null,
              snap.adjusted_price_cents ?? null,
            ]
          );
        }
      }

      // Audit log
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: estimateId,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { client_id, status: "draft", total_cents, presentation_mode },
      });

      await createActionItem(client, {
        accountId: session.accountId,
        entityType: "estimate",
        entityId: estimateId,
        actionType: "send_estimate",
        title: `Send estimate to ${clientName}`,
      });

      return estimateId;
    });

    // If an engine spec was provided, run the engine and persist the result
    let engineResult: Awaited<ReturnType<typeof computeAndPersist>> | null = null;
    if (engine_spec) {
      try {
        engineResult = await computeAndPersist({
          estimateId: estimate,
          accountId: session.accountId,
          spec: engine_spec as unknown as EstimateSpec,
        });
      } catch (engErr) {
        logger.error("Engine compute failed after insert", engErr, { estimateId: estimate });
        // Non-fatal: the estimate row exists; caller can trigger recompute
      }
    }

    return NextResponse.json({
      id: estimate,
      ...(engineResult ? { engineResult: engineResult.result } : {}),
    }, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Client not found",
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    logger.error("POST /api/v1/estimates error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create estimate",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
