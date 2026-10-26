import { z } from "zod";
import { appendAuditLog } from "@/lib/db/audit";
import { withEstimateContext, calcTotals, lineItemTotal } from "@/lib/estimates/db";
import {
  computeEstimate,
  sqftPaintingToSpec,
  estimateAdjustmentTypeSchema,
  estimateFinishExpectationSchema,
  estimateMinimumOverrideReasonSchema,
  estimateTripCountSchema,
  type EstimateSpec,
  type PreparedScope,
} from "@ai-fsm/domain";
import { defaultMaterialPrice, linePriceMissing, splitInternalCosts } from "@/lib/estimates/cost-split";
import { logger } from "@/lib/logger";
import { reviewEstimateGuardrails, computeConditionTier } from "@/lib/estimates/guardrails";
import { computeAndPersist } from "@/lib/estimates/compute";
import { calculateDepositPolicy, estimateMaterialsDepositBasis } from "@/lib/estimates/deposit-policy";
import { getPool } from "@/lib/db";
import { loadPricingRules } from "@/lib/pricing/settings";
import { laborCostCentsFromHours } from "@/lib/pricing/labor-hours";
import { advanceBookingRequestStage } from "@/lib/booking-requests/advance-stage";
import type { AuthSession } from "@/lib/auth/middleware";

/*
 * Create a draft estimate: totals, margin, deposit policy, guardrails, line
 * items, options, audit. The one create path, shared by POST /api/v1/estimates
 * and Prepare Quote (TASK-179). Throws errors carrying `code` ("NOT_FOUND",
 * "VALIDATION_ERROR"); callers map them to responses.
 */

const lineItemInputSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: z.number().int().nonnegative().optional(),
  unit_cost_cents: z.number().int().nonnegative().nullable().optional(),
  /** Used for labor cost when sent. Stored with the line in TASK-191. */
  hours_high: z.number().nonnegative().nullable().optional(),
  line_item_type: z.enum(["labor", "materials", "handling_fee", "adjustment"]).default("labor"),
  visible_to_customer: z.boolean().default(true),
  adjustment_type: estimateAdjustmentTypeSchema.nullable().optional(),
  sort_order: z.number().int().default(0),
  price_book_id: z.string().uuid().nullable().optional(),
}).superRefine((item, ctx) => {
  if (linePriceMissing(item)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter a price, or a cost on a materials line",
      path: ["unit_price_cents"],
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

export const createEstimateSchema = z.object({
  client_id: z.string().uuid(),
  job_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  vault_item_id: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  expires_at: z.string().datetime().nullable().optional(),
  tax_rate: z.number().min(0).max(100).default(0),
  deposit_required: z.boolean().default(false),
  deposit_type: z.enum(["none", "materials", "percentage", "fixed"]).default("none"),
  deposit_percentage: z.number().min(0).max(100).nullable().optional(),
  deposit_fixed_cents: z.number().int().nonnegative().nullable().optional(),
  deposit_due_trigger: z.enum(["on_acceptance", "before_scheduling", "before_material_order", "custom"]).default("before_scheduling"),
  terms_scope_accepted: z.boolean().default(false),
  terms_payment_accepted: z.boolean().default(false),
  terms_change_order_accepted: z.boolean().default(false),
  line_items: z.array(lineItemInputSchema).default([]),
  // Flat-rate mode: set this instead of line_items to store a single price with no breakdown
  flat_rate_cents: z.number().int().nonnegative().optional(),
  // Multi-option mode (Good/Better/Best)
  presentation_mode: z.enum(["standard", "multi_option"]).default("standard"),
  // Commercial lane: bid vs T&M. Not the form layout.
  pricing_mode: z.enum(["flat_rate", "hourly_internal"]).optional(),
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
  // AI planning data
  shopping_list_json: z.record(z.unknown()).optional(),
  specified_materials_json: z.array(z.record(z.unknown())).optional(),
  // Room-by-room painting spec
  room_specs: z.array(z.record(z.unknown())).optional(),
  // Engine v2: room-by-room spec — when present, computeAndPersist() runs after insert
  engine_spec: z.record(z.unknown()).optional(),
  // Intake request that originated this estimate (for chain traceability)
  booking_request_id: z.string().uuid().nullable().optional(),
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

export type CreateEstimateInput = z.infer<typeof createEstimateSchema>;

/** Fields only server-side callers set; never accepted from the request body. */
export interface CreateEstimateExtra {
  sourceVisitId?: string | null;
  preparedScope?: PreparedScope | null;
  /** Prepared-scope group key per line item, by index (Apply to quote ownership). */
  lineGroupKeys?: (string | null)[];
}

export interface CreateEstimateResult {
  id: string;
  engineResult?: Awaited<ReturnType<typeof computeAndPersist>>["result"];
}

export async function createEstimate(
  session: AuthSession,
  input: CreateEstimateInput,
  extra: CreateEstimateExtra = {},
): Promise<CreateEstimateResult> {
  const {
    client_id,
    job_id,
    property_id,
    vault_item_id,
    notes,
    internal_notes,
    expires_at,
    tax_rate,
    deposit_required,
    deposit_type,
    deposit_percentage,
    deposit_fixed_cents,
    deposit_due_trigger,
    terms_scope_accepted,
    terms_payment_accepted,
    terms_change_order_accepted,
    line_items: rawLineItems,
    flat_rate_cents,
    presentation_mode,
    pricing_mode,
    options: rawOptions,
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
    shopping_list_json,
    specified_materials_json,
    room_specs,
    engine_spec,
    scope_snapshots,
    booking_request_id,
  } = input;

  const line_items = rawLineItems.map(defaultMaterialPrice);
  const options = rawOptions?.map((option) => ({
    ...option,
    line_items: option.line_items.map(defaultMaterialPrice),
  }));

  const is_painting = sq_ft !== undefined && prep_level !== undefined && labor_hours_estimate !== undefined;
  const is_multi_option = presentation_mode === "multi_option" && options && options.length > 0;
  const commercialPricingMode = pricing_mode === "hourly_internal" ? "hourly_internal" : "flat_rate";

  if (is_multi_option && is_painting) {
    throw Object.assign(new Error("Painting estimates cannot use multi-option mode"), { code: "VALIDATION_ERROR" });
  }

  // Account labor cost / bill rates drive margin checks.
  // set_config(..., true) is transaction-local — must run inside BEGIN so RLS
  // can see business_pricing_settings (FORCE RLS + app_account_id policies).
  const pool = getPool();
  const pricingClient = await pool.connect();
  let pricingRules;
  try {
    await pricingClient.query("BEGIN");
    await pricingClient.query(
      `SELECT set_config('app.current_account_id', $1, true),
              set_config('app.current_user_id', $2, true),
              set_config('app.current_role', $3, true)`,
      [session.accountId, session.userId, session.role]
    );
    pricingRules = (await loadPricingRules(pricingClient, session.accountId)).rules;
    await pricingClient.query("COMMIT");
  } catch (err) {
    await pricingClient.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    pricingClient.release();
  }

  let subtotal_cents: number;
  let computed_line_items = line_items;
  let internal_labor_cost_cents: number | null = null;
  let internal_material_cost_cents: number | null = material_cost_cents ?? null;
  let margin_pct: number | null = null;

  if (is_painting) {
    const engine = computeEstimate(
      sqftPaintingToSpec({
        sq_ft,
        prep_level,
        includes_trim,
        includes_ceiling,
        material_cost_cents: material_cost_cents ?? 0,
        labor_hours_estimate,
      }),
      pricingRules
    );
    subtotal_cents = engine.summary.totalCents;
    internal_labor_cost_cents = laborCostCentsFromHours(
      labor_hours_estimate,
      pricingRules.laborCostCentsPerHour,
    );
    margin_pct = engine.internalSummary.grossMarginPct;
  } else if (is_multi_option) {
    subtotal_cents = 0;
  } else if (flat_rate_cents !== undefined) {
    subtotal_cents = flat_rate_cents;
    // Flat bid: cost unknown unless labor hours provided
    if (labor_hours_estimate && labor_hours_estimate > 0) {
      internal_labor_cost_cents = Math.round(
        labor_hours_estimate * pricingRules.laborCostCentsPerHour
      );
      const gross = flat_rate_cents - internal_labor_cost_cents;
      margin_pct = flat_rate_cents > 0 ? gross / flat_rate_cents : 0;
    }
  } else {
    subtotal_cents = calcTotals(line_items).subtotal_cents;
    // Itemized: labor and materials cost stay apart. The engine's 15% handling
    // line is not billed, so it is not part of this margin.
    const split = splitInternalCosts(line_items, {
      billingCents: pricingRules.laborBillingCentsPerHour,
      costCents: pricingRules.laborCostCentsPerHour,
    });
    internal_labor_cost_cents = split.laborCostCents;
    internal_material_cost_cents = split.materialCostCents;
    margin_pct = split.marginPct;
  }
  subtotal_cents += travel_surcharge_cents + risk_adjustment_cents;
  const tax_cents = Math.round((subtotal_cents * tax_rate) / 100);
  const total_cents = subtotal_cents + tax_cents;
  const materialBasisCents = is_painting
    ? material_cost_cents ?? 0
    : estimateMaterialsDepositBasis(line_items, material_cost_cents ?? 0);
  const depositPolicy = calculateDepositPolicy({
    deposit_required,
    deposit_type,
    deposit_percentage,
    deposit_fixed_cents,
    material_total_cents: materialBasisCents,
    total_cents,
  });
  const deposit_cents = depositPolicy.deposit_cents;
  const balance_cents = depositPolicy.balance_cents;
  // A multi-option estimate has no single total until the customer picks, so
  // keep the owner's deposit rule as entered; approval applies it to the chosen
  // option (TASK-181). Others store the rule as calculated.
  const storedDeposit = is_multi_option
    ? { deposit_required: deposit_required && deposit_type !== "none", deposit_type: deposit_required ? deposit_type : "none" }
    : { deposit_required: depositPolicy.deposit_required, deposit_type: depositPolicy.deposit_type };
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
    margin_pct,
    has_ma_regulated_items: false,
    line_item_count: line_items?.length ?? 0,
  }, pricingRules);
  // In flat-rate mode, ignore any line_items that were mistakenly sent
  const itemsToInsert = flat_rate_cents !== undefined ? [] : line_items;

  const estimate = await withEstimateContext(session, async (client) => {
    // Verify client belongs to account
    const clientRow = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE id = $1 AND account_id = $2`,
      [client_id, session.accountId]
    );
    if (clientRow.rowCount === 0) {
      throw Object.assign(new Error("Client not found"), { code: "NOT_FOUND" });
    }

    const result = await client.query<{ id: string }>(
      `INSERT INTO estimates
         (account_id, client_id, job_id, property_id, vault_item_id, status, presentation_mode,
          subtotal_cents, tax_cents, total_cents, deposit_cents, balance_cents,
          deposit_required, deposit_type, deposit_percentage, deposit_fixed_cents, deposit_due_trigger,
          terms_scope_accepted, terms_payment_accepted, terms_change_order_accepted,
          notes, internal_notes, expires_at, created_by,
          sq_ft, prep_level, includes_trim, includes_ceiling,
          internal_labor_cost_cents, internal_material_cost_cents,
          trip_count, requires_drying_or_curing, difficult_access, old_house_risk,
          coordination_required, finish_expectation, travel_surcharge_cents,
          risk_adjustment_cents, minimum_service_override_reason,
          minimum_service_override_note, pricing_review_status, scope_assumptions,
          condition_tier, shopping_list_json, specified_materials_json, room_specs,
          booking_request_id, pricing_mode, source_visit_id, prepared_scope)
        VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11,
                $12, $13, $14, $15, $16, $17, $18, $19,
                $20, $21, $22, $23, $24, $25, $26, $27,
                $28, $29, $30, $31, $32, $33, $34, $35,
                $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47,
                $48, $49)
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
        storedDeposit.deposit_required,
        storedDeposit.deposit_type,
        storedDeposit.deposit_type === "percentage" ? deposit_percentage ?? null : null,
        storedDeposit.deposit_type === "fixed" ? deposit_fixed_cents ?? null : null,
        deposit_due_trigger,
        terms_scope_accepted,
        terms_payment_accepted,
        terms_change_order_accepted,
        notes ?? null,
        internal_notes ?? null,
        expires_at ?? null,
        session.userId,
        sq_ft ?? null,
        prep_level ?? null,
        includes_trim ?? false,
        includes_ceiling ?? false,
        internal_labor_cost_cents,
        internal_material_cost_cents,
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
        shopping_list_json ? JSON.stringify(shopping_list_json) : null,
        specified_materials_json ? JSON.stringify(specified_materials_json) : null,
        room_specs ? JSON.stringify(room_specs) : null,
        booking_request_id ?? null,
        commercialPricingMode,
        extra.sourceVisitId ?? null,
        extra.preparedScope ? JSON.stringify(extra.preparedScope) : null,
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
                line_item_type, visible_to_customer, adjustment_type, sort_order, price_book_id,
                unit_cost_cents)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
              item.unit_cost_cents ?? null,
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
              line_item_type, visible_to_customer, adjustment_type, sort_order, price_book_id,
              prepared_group_key, unit_cost_cents)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
            extra.lineGroupKeys?.[i] ?? null,
            item.unit_cost_cents ?? null,
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

    // Funnel: estimate on the table → request stage "estimated"
    if (booking_request_id) {
      await advanceBookingRequestStage(client, {
        accountId: session.accountId,
        requestId: booking_request_id,
        target: "estimated",
        actorId: session.userId,
        note: "Estimate created",
      });
    }

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
        rules: pricingRules,
      });
    } catch (engErr) {
      logger.error("Engine compute failed after insert", engErr, { estimateId: estimate });
      // Non-fatal: the estimate row exists; caller can trigger recompute
    }
  }

  return { id: estimate, ...(engineResult ? { engineResult: engineResult.result } : {}) };
}
