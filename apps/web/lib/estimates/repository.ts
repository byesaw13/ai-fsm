import type { PoolClient } from "pg";
import { appendAuditLog } from "@/lib/db/audit";
import { calcTotals, lineItemTotal } from "./math";
import { computeEstimate, sqftPaintingToSpec, CURRENT_RULES } from "@ai-fsm/domain";
import { calculateDepositPolicy, estimateMaterialsDepositBasis } from "./deposit-policy";
import { computeConditionTier } from "./guardrails";

export interface LineItemInput {
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_item_type: "labor" | "materials" | "handling_fee" | "adjustment";
  visible_to_customer: boolean;
  adjustment_type?: string | null;
  sort_order: number;
}

export interface EstimateOptionInput {
  label: string;
  description?: string | null;
  sort_order: number;
  line_items: LineItemInput[];
  is_recommended: boolean;
}

export interface PatchEstimateInput {
  client_id?: string;
  job_id?: string | null;
  property_id?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  expires_at?: string | null;
  tax_rate?: number;
  deposit_required?: boolean;
  deposit_type?: "none" | "materials" | "percentage" | "fixed";
  deposit_percentage?: number | null;
  deposit_fixed_cents?: number | null;
  deposit_due_trigger?: "on_acceptance" | "before_scheduling" | "before_material_order" | "custom";
  terms_scope_accepted?: boolean;
  terms_payment_accepted?: boolean;
  terms_change_order_accepted?: boolean;
  line_items?: LineItemInput[];
  flat_rate_cents?: number;
  presentation_mode?: "standard" | "multi_option";
  options?: EstimateOptionInput[];
  sq_ft?: number;
  prep_level?: number;
  includes_trim?: boolean;
  includes_ceiling?: boolean;
  material_cost_cents?: number;
  labor_hours_estimate?: number;
  trip_count?: string;
  requires_drying_or_curing?: boolean;
  difficult_access?: boolean;
  old_house_risk?: boolean;
  coordination_required?: boolean;
  finish_expectation?: string;
  travel_surcharge_cents?: number;
  risk_adjustment_cents?: number;
  minimum_service_override_reason?: string | null;
  minimum_service_override_note?: string | null;
  scope_assumptions?: string | null;
  room_specs?: Record<string, unknown>[] | null;
  shopping_list_json?: Record<string, unknown> | null;
}

interface SessionContext {
  accountId: string;
  userId: string;
  traceId: string;
}

export async function getEstimateById(client: PoolClient, id: string, accountId: string) {
  const estimateResult = await client.query(
    `SELECT e.id, e.status, e.subtotal_cents, e.tax_cents, e.total_cents,
            e.notes, e.internal_notes, e.sent_at, e.expires_at,
            e.client_id, e.job_id, e.property_id,
            e.created_by, e.created_at, e.updated_at,
            e.presentation_mode,
            e.deposit_required, e.deposit_type, e.deposit_percentage, e.deposit_fixed_cents,
            e.deposit_due_trigger, e.terms_scope_accepted, e.terms_payment_accepted,
            e.terms_change_order_accepted,
            e.trip_count, e.requires_drying_or_curing, e.difficult_access,
            e.old_house_risk, e.coordination_required, e.finish_expectation,
            e.travel_surcharge_cents, e.risk_adjustment_cents,
            e.minimum_service_override_reason, e.minimum_service_override_note,
            e.pricing_review_status, e.pricing_reviewed_at, e.pricing_reviewed_by,
            e.scope_assumptions, e.condition_tier,
            c.name AS client_name
     FROM estimates e
     LEFT JOIN clients c ON c.id = e.client_id
     WHERE e.id = $1 AND e.account_id = $2`,
    [id, accountId]
  );

  if (estimateResult.rowCount === 0) return null;

  const lineItemsResult = await client.query(
    `SELECT id, estimate_id, option_id, description, quantity, unit_price_cents,
            total_cents, line_item_type, visible_to_customer, adjustment_type, sort_order, created_at
     FROM estimate_line_items
     WHERE estimate_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [id]
  );

  const optionsResult = await client.query(
    `SELECT id, estimate_id, label, description, sort_order, subtotal_cents, tax_cents, total_cents, is_recommended, created_at
     FROM estimate_options
     WHERE estimate_id = $1
     ORDER BY sort_order ASC, created_at ASC`,
    [id]
  );

  const estimate: Record<string, unknown> = {
    ...estimateResult.rows[0],
    line_items: lineItemsResult.rows.filter((r: { option_id: string | null }) => !r.option_id),
  };

  if (optionsResult.rows.length > 0) {
    estimate.options = optionsResult.rows.map((opt: { id: string }) => ({
      ...opt,
      line_items: lineItemsResult.rows.filter((r: { option_id: string | null }) => r.option_id === opt.id),
    }));
  }

  return estimate;
}

export async function updateEstimateById(
  client: PoolClient,
  id: string,
  session: SessionContext,
  patch: PatchEstimateInput
): Promise<{ updated: true }> {
  const existing = await client.query<{
    id: string;
    status: string;
    subtotal_cents: number;
    tax_cents: number;
    total_cents: number;
    travel_surcharge_cents: number;
    risk_adjustment_cents: number;
    old_house_risk: boolean;
    difficult_access: boolean;
    trip_count: string;
    requires_drying_or_curing: boolean;
    coordination_required: boolean;
    internal_material_cost_cents: number | null;
    deposit_required: boolean;
    deposit_type: "none" | "materials" | "percentage" | "fixed";
    deposit_percentage: number | null;
    deposit_fixed_cents: number | null;
  }>(
    `SELECT id, status, subtotal_cents, tax_cents, total_cents,
            travel_surcharge_cents, risk_adjustment_cents,
            old_house_risk, difficult_access, trip_count,
            requires_drying_or_curing, coordination_required,
            internal_material_cost_cents,
            deposit_required, deposit_type, deposit_percentage, deposit_fixed_cents
     FROM estimates WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  if (existing.rowCount === 0) {
    throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
  }

  const est = existing.rows[0];

  if (["approved", "declined", "expired"].includes(est.status)) {
    throw Object.assign(
      new Error(`Estimate in ${est.status} state is immutable`),
      { code: "IMMUTABLE_ENTITY" }
    );
  }

  if (est.status === "sent") {
    const disallowedKeys = [
      "client_id", "job_id", "property_id", "notes", "expires_at",
      "line_items", "flat_rate_cents", "sq_ft", "prep_level",
      "includes_trim", "includes_ceiling", "material_cost_cents",
      "labor_hours_estimate", "presentation_mode", "options",
      "trip_count", "requires_drying_or_curing", "difficult_access",
      "old_house_risk", "coordination_required", "finish_expectation",
      "travel_surcharge_cents", "risk_adjustment_cents",
      "minimum_service_override_reason", "minimum_service_override_note",
      "deposit_required", "deposit_type", "deposit_percentage", "deposit_fixed_cents",
      "deposit_due_trigger", "terms_scope_accepted", "terms_payment_accepted", "terms_change_order_accepted",
    ] as const;
    for (const key of disallowedKeys) {
      if (patch[key] !== undefined) {
        throw Object.assign(
          new Error("Estimate in sent state: only internal_notes may be updated"),
          { code: "IMMUTABLE_ENTITY" }
        );
      }
    }

    if (patch.internal_notes !== undefined) {
      await client.query(
        `UPDATE estimates SET internal_notes = $1, updated_at = now() WHERE id = $2`,
        [patch.internal_notes, id]
      );
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "estimate",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { internal_notes: null },
        new_value: { internal_notes: patch.internal_notes },
      });
    }

    return { updated: true };
  }

  // Draft state: full update
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (patch.client_id !== undefined) { setClauses.push(`client_id = $${idx++}`); params.push(patch.client_id); }
  if (patch.job_id !== undefined) { setClauses.push(`job_id = $${idx++}`); params.push(patch.job_id); }
  if (patch.property_id !== undefined) { setClauses.push(`property_id = $${idx++}`); params.push(patch.property_id); }
  if (patch.notes !== undefined) { setClauses.push(`notes = $${idx++}`); params.push(patch.notes); }
  if (patch.internal_notes !== undefined) { setClauses.push(`internal_notes = $${idx++}`); params.push(patch.internal_notes); }
  if (patch.expires_at !== undefined) { setClauses.push(`expires_at = $${idx++}`); params.push(patch.expires_at); }
  if (patch.sq_ft !== undefined) { setClauses.push(`sq_ft = $${idx++}`); params.push(patch.sq_ft); }
  if (patch.prep_level !== undefined) { setClauses.push(`prep_level = $${idx++}`); params.push(patch.prep_level); }
  if (patch.includes_trim !== undefined) { setClauses.push(`includes_trim = $${idx++}`); params.push(patch.includes_trim); }
  if (patch.includes_ceiling !== undefined) { setClauses.push(`includes_ceiling = $${idx++}`); params.push(patch.includes_ceiling); }
  if (patch.presentation_mode !== undefined) { setClauses.push(`presentation_mode = $${idx++}`); params.push(patch.presentation_mode); }
  if (patch.trip_count !== undefined) { setClauses.push(`trip_count = $${idx++}`); params.push(patch.trip_count); }
  if (patch.requires_drying_or_curing !== undefined) { setClauses.push(`requires_drying_or_curing = $${idx++}`); params.push(patch.requires_drying_or_curing); }
  if (patch.difficult_access !== undefined) { setClauses.push(`difficult_access = $${idx++}`); params.push(patch.difficult_access); }
  if (patch.old_house_risk !== undefined) { setClauses.push(`old_house_risk = $${idx++}`); params.push(patch.old_house_risk); }
  if (patch.coordination_required !== undefined) { setClauses.push(`coordination_required = $${idx++}`); params.push(patch.coordination_required); }
  if (patch.finish_expectation !== undefined) { setClauses.push(`finish_expectation = $${idx++}`); params.push(patch.finish_expectation); }
  if (patch.travel_surcharge_cents !== undefined) { setClauses.push(`travel_surcharge_cents = $${idx++}`); params.push(patch.travel_surcharge_cents); }
  if (patch.risk_adjustment_cents !== undefined) { setClauses.push(`risk_adjustment_cents = $${idx++}`); params.push(patch.risk_adjustment_cents); }
  if (patch.minimum_service_override_reason !== undefined) { setClauses.push(`minimum_service_override_reason = $${idx++}`); params.push(patch.minimum_service_override_reason); }
  if (patch.minimum_service_override_note !== undefined) { setClauses.push(`minimum_service_override_note = $${idx++}`); params.push(patch.minimum_service_override_note); }
  if (patch.scope_assumptions !== undefined) { setClauses.push(`scope_assumptions = $${idx++}`); params.push(patch.scope_assumptions); }
  if (patch.room_specs !== undefined) { setClauses.push(`room_specs = $${idx++}`); params.push(JSON.stringify(patch.room_specs)); }
  if (patch.shopping_list_json !== undefined) { setClauses.push(`shopping_list_json = $${idx++}`); params.push(JSON.stringify(patch.shopping_list_json)); }
  if (patch.deposit_required !== undefined) { setClauses.push(`deposit_required = $${idx++}`); params.push(patch.deposit_required); }
  if (patch.deposit_type !== undefined) { setClauses.push(`deposit_type = $${idx++}`); params.push(patch.deposit_type); }
  if (patch.deposit_percentage !== undefined) { setClauses.push(`deposit_percentage = $${idx++}`); params.push(patch.deposit_percentage); }
  if (patch.deposit_fixed_cents !== undefined) { setClauses.push(`deposit_fixed_cents = $${idx++}`); params.push(patch.deposit_fixed_cents); }
  if (patch.deposit_due_trigger !== undefined) { setClauses.push(`deposit_due_trigger = $${idx++}`); params.push(patch.deposit_due_trigger); }
  if (patch.terms_scope_accepted !== undefined) { setClauses.push(`terms_scope_accepted = $${idx++}`); params.push(patch.terms_scope_accepted); }
  if (patch.terms_payment_accepted !== undefined) { setClauses.push(`terms_payment_accepted = $${idx++}`); params.push(patch.terms_payment_accepted); }
  if (patch.terms_change_order_accepted !== undefined) { setClauses.push(`terms_change_order_accepted = $${idx++}`); params.push(patch.terms_change_order_accepted); }

  // Auto-recompute condition_tier when any risk flag changes
  const tierFields = ["old_house_risk", "difficult_access", "trip_count", "requires_drying_or_curing", "coordination_required"] as const;
  if (tierFields.some((f) => patch[f] !== undefined)) {
    const tier = computeConditionTier({
      old_house_risk:            patch.old_house_risk            ?? est.old_house_risk,
      difficult_access:          patch.difficult_access          ?? est.difficult_access,
      trip_count:                patch.trip_count                ?? est.trip_count,
      requires_drying_or_curing: patch.requires_drying_or_curing ?? est.requires_drying_or_curing,
      coordination_required:     patch.coordination_required     ?? est.coordination_required,
    });
    setClauses.push(`condition_tier = $${idx++}`);
    params.push(tier);
  }

  const has_painting_fields =
    patch.sq_ft !== undefined &&
    patch.prep_level !== undefined &&
    patch.labor_hours_estimate !== undefined;

  const has_guardrail_amounts =
    patch.travel_surcharge_cents !== undefined ||
    patch.risk_adjustment_cents !== undefined;
  const has_deposit_policy_fields =
    patch.deposit_required !== undefined ||
    patch.deposit_type !== undefined ||
    patch.deposit_percentage !== undefined ||
    patch.deposit_fixed_cents !== undefined;

  if (patch.line_items !== undefined || patch.flat_rate_cents !== undefined || has_painting_fields || has_guardrail_amounts || has_deposit_policy_fields) {
    let subtotal_cents: number;
    let itemsToInsert = patch.line_items ?? [];
    let new_internal_labor: number | null = null;
    let new_internal_material: number | null = null;

    if (has_painting_fields) {
      const engine = computeEstimate(
        sqftPaintingToSpec({
          sq_ft: patch.sq_ft!,
          prep_level: patch.prep_level!,
          includes_trim: patch.includes_trim ?? false,
          includes_ceiling: patch.includes_ceiling ?? false,
          material_cost_cents: patch.material_cost_cents ?? 0,
          labor_hours_estimate: patch.labor_hours_estimate!,
        }),
        CURRENT_RULES
      );
      subtotal_cents = engine.summary.totalCents;
      new_internal_labor = engine.internalSummary.estimatedCostCents;
      new_internal_material = patch.material_cost_cents ?? null;
    } else {
      if (patch.flat_rate_cents !== undefined) {
        subtotal_cents = patch.flat_rate_cents;
        itemsToInsert = [];
      } else if (patch.line_items !== undefined) {
        subtotal_cents = calcTotals(patch.line_items).subtotal_cents;
        itemsToInsert = patch.line_items;
      } else {
        subtotal_cents =
          est.subtotal_cents -
          est.travel_surcharge_cents -
          est.risk_adjustment_cents;
        itemsToInsert = [];
      }
    }
    subtotal_cents += patch.travel_surcharge_cents ?? est.travel_surcharge_cents;
    subtotal_cents += patch.risk_adjustment_cents ?? est.risk_adjustment_cents;

    const taxRate = patch.tax_rate ?? 0;
    const tax_cents = Math.round((subtotal_cents * taxRate) / 100);
    const total_cents = subtotal_cents + tax_cents;
    let currentMaterialBasis = new_internal_material ?? 0;
    if (itemsToInsert.length === 0 && currentMaterialBasis === 0) {
      const materialRows = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(total_cents), 0)::text AS total
         FROM estimate_line_items
         WHERE estimate_id = $1 AND visible_to_customer = true AND line_item_type = 'materials'`,
        [id]
      );
      currentMaterialBasis = Number(materialRows.rows[0]?.total ?? 0);
    }
    const depositPolicy = calculateDepositPolicy({
      deposit_required: patch.deposit_required ?? est.deposit_required ?? false,
      deposit_type: patch.deposit_type ?? est.deposit_type ?? "none",
      deposit_percentage: patch.deposit_percentage ?? est.deposit_percentage ?? null,
      deposit_fixed_cents: patch.deposit_fixed_cents ?? est.deposit_fixed_cents ?? null,
      material_total_cents: estimateMaterialsDepositBasis(itemsToInsert, currentMaterialBasis),
      total_cents,
    });
    const deposit_cents = depositPolicy.deposit_cents;
    const balance_cents = depositPolicy.balance_cents;

    setClauses.push(`subtotal_cents = $${idx++}`); params.push(subtotal_cents);
    setClauses.push(`tax_cents = $${idx++}`); params.push(tax_cents);
    setClauses.push(`total_cents = $${idx++}`); params.push(total_cents);
    setClauses.push(`deposit_cents = $${idx++}`); params.push(deposit_cents);
    setClauses.push(`balance_cents = $${idx++}`); params.push(balance_cents);

    if (new_internal_labor !== null) { setClauses.push(`internal_labor_cost_cents = $${idx++}`); params.push(new_internal_labor); }
    if (new_internal_material !== null) { setClauses.push(`internal_material_cost_cents = $${idx++}`); params.push(new_internal_material); }

    if (patch.line_items !== undefined || patch.flat_rate_cents !== undefined || has_painting_fields) {
      await client.query(`DELETE FROM estimate_line_items WHERE estimate_id = $1`, [id]);

      for (let i = 0; i < itemsToInsert.length; i++) {
        const item = itemsToInsert[i];
        await client.query(
          `INSERT INTO estimate_line_items
             (estimate_id, description, quantity, unit_price_cents, total_cents,
              line_item_type, visible_to_customer, adjustment_type, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            id, item.description, item.quantity, item.unit_price_cents,
            lineItemTotal(item), item.line_item_type, item.visible_to_customer,
            item.adjustment_type ?? null, item.sort_order ?? i,
          ]
        );
      }
    }
  }

  if (patch.options !== undefined) {
    const taxRate = patch.tax_rate ?? 0;
    await client.query(`DELETE FROM estimate_options WHERE estimate_id = $1`, [id]);

    if (patch.presentation_mode === "standard") {
      await client.query(
        `DELETE FROM estimate_line_items WHERE estimate_id = $1 AND option_id IS NOT NULL`,
        [id]
      );
    }

    for (let oi = 0; oi < patch.options.length; oi++) {
      const option = patch.options[oi];
      const optionSubtotal = calcTotals(option.line_items).subtotal_cents;
      const optionTax = Math.round((optionSubtotal * taxRate) / 100);
      const optionTotal = optionSubtotal + optionTax;

      const optionResult = await client.query<{ id: string }>(
        `INSERT INTO estimate_options
           (estimate_id, label, description, sort_order, subtotal_cents, tax_cents, total_cents, is_recommended)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [id, option.label, option.description ?? null, option.sort_order ?? oi, optionSubtotal, optionTax, optionTotal, option.is_recommended]
      );
      const optionId = optionResult.rows[0].id;

      for (let li = 0; li < option.line_items.length; li++) {
        const item = option.line_items[li];
        await client.query(
          `INSERT INTO estimate_line_items
             (estimate_id, option_id, description, quantity, unit_price_cents, total_cents,
              line_item_type, visible_to_customer, adjustment_type, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            id, optionId, item.description, item.quantity, item.unit_price_cents,
            lineItemTotal(item), item.line_item_type, item.visible_to_customer,
            item.adjustment_type ?? null, item.sort_order ?? li,
          ]
        );
      }
    }

    if (patch.options.length > 0) {
      const maxOptionTotal = Math.max(...patch.options.map((o) => {
        const sub = calcTotals(o.line_items).subtotal_cents;
        const tax = Math.round((sub * taxRate) / 100);
        return sub + tax;
      }));
      const depositPolicy = calculateDepositPolicy({
        deposit_required: est.deposit_required ?? false,
        deposit_type: est.deposit_type ?? "none",
        deposit_percentage: est.deposit_percentage ?? null,
        deposit_fixed_cents: est.deposit_fixed_cents ?? null,
        material_total_cents: 0,
        total_cents: maxOptionTotal,
      });
      const deposit_cents = depositPolicy.deposit_cents;
      const balance_cents = depositPolicy.balance_cents;
      const firstSub = calcTotals(patch.options[0].line_items).subtotal_cents;
      setClauses.push(`subtotal_cents = $${idx++}`); params.push(firstSub);
      setClauses.push(`tax_cents = $${idx++}`); params.push(Math.round((firstSub * taxRate) / 100));
      setClauses.push(`total_cents = $${idx++}`); params.push(maxOptionTotal);
      setClauses.push(`deposit_cents = $${idx++}`); params.push(deposit_cents);
      setClauses.push(`balance_cents = $${idx++}`); params.push(balance_cents);
    }
  }

  if (
    patch.line_items !== undefined ||
    patch.flat_rate_cents !== undefined ||
    has_painting_fields ||
    patch.options !== undefined ||
    patch.trip_count !== undefined ||
    patch.requires_drying_or_curing !== undefined ||
    patch.difficult_access !== undefined ||
    patch.old_house_risk !== undefined ||
    patch.coordination_required !== undefined ||
    patch.finish_expectation !== undefined ||
    patch.travel_surcharge_cents !== undefined ||
    patch.risk_adjustment_cents !== undefined ||
    patch.minimum_service_override_reason !== undefined
  ) {
    setClauses.push(`pricing_review_status = $${idx++}`);
    params.push("needs_review");
    setClauses.push(`pricing_reviewed_at = NULL`);
    setClauses.push(`pricing_reviewed_by = NULL`);
  }

  if (setClauses.length > 0) {
    setClauses.push(`updated_at = now()`);
    params.push(id);
    await client.query(
      `UPDATE estimates SET ${setClauses.join(", ")} WHERE id = $${idx}`,
      params
    );
  }

  await appendAuditLog(client, {
    account_id: session.accountId,
    entity_type: "estimate",
    entity_id: id,
    action: "update",
    actor_id: session.userId,
    trace_id: session.traceId,
    old_value: { status: est.status, total_cents: est.total_cents },
    new_value: patch as Record<string, unknown>,
  });

  return { updated: true };
}

export async function deleteEstimateById(
  client: PoolClient,
  id: string,
  session: SessionContext
): Promise<void> {
  const existing = await client.query<{ id: string; status: string }>(
    `SELECT id, status FROM estimates WHERE id = $1 AND account_id = $2`,
    [id, session.accountId]
  );

  if (existing.rowCount === 0) {
    throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" });
  }

  const est = existing.rows[0];
  if (est.status !== "draft") {
    throw Object.assign(new Error("Only draft estimates may be deleted"), { code: "IMMUTABLE_ENTITY" });
  }

  await client.query(`DELETE FROM estimates WHERE id = $1`, [id]);

  await appendAuditLog(client, {
    account_id: session.accountId,
    entity_type: "estimate",
    entity_id: id,
    action: "delete",
    actor_id: session.userId,
    trace_id: session.traceId,
    old_value: { status: est.status },
  });
}
