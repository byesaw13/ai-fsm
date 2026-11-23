/**
 * Hourly baseline on an estimate (TASK-194).
 *
 * Builds the formula input from stored rows, applies the send rules and
 * freezes the result at send. Nothing here writes a price or a line.
 */
import type { PoolClient } from "pg";
import {
  billingRateCentsForState,
  computeHourlyBaseline,
  type BaselineInput,
  type BaselineLine,
  type BaselineResult,
  type BusinessPricingSettings,
} from "@ai-fsm/domain";
import { documentJoins } from "@/lib/documents/service-location";
import { loadPricingSettings } from "@/lib/pricing/settings";

export interface BaselineEstimateRow {
  subtotal_cents: number | string;
  presentation_mode: string | null;
  labor_hours_low: number | string | null;
  labor_hours_high: number | string | null;
  travel_surcharge_cents: number | string | null;
  handling_in_baseline: boolean | null;
  other_direct_cost_cents: number | string | null;
  direct_costs_confirmed_at: Date | string | null;
}

export interface BaselineLineRow {
  line_item_type: string;
  quantity: number | string;
  unit_price_cents: number | string;
  unit_cost_cents: number | string | null;
  hours_low: number | string | null;
  hours_high: number | string | null;
  hours_source: string | null;
  adjustment_type: string | null;
  description: string;
}

/** Frozen at send: the result and every rate it used. Later settings never change it. */
export interface BaselineSnapshot {
  version: 1;
  frozen_at: string;
  sell_rate_cents: number;
  cost_floor_cents: number;
  handling_pct: number;
  handling_on: boolean;
  warning_pct: number;
  other_direct_cents: number | null;
  quoted_cents: number;
  result: BaselineResult;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Driving time billed at the labor rate (TASK-191 writes it from the travel calculation). */
function isTravelTimeLine(row: Pick<BaselineLineRow, "adjustment_type" | "hours_source" | "description">): boolean {
  if (row.adjustment_type !== "travel_surcharge") return false;
  return row.hours_source === "travel_calc" || /travel time/i.test(row.description);
}

function baselineType(type: string): BaselineLine["type"] {
  return type === "materials" || type === "equipment" || type === "handling_fee" || type === "adjustment"
    ? type
    : "labor";
}

export function baselineInputFor(
  est: BaselineEstimateRow,
  lines: BaselineLineRow[],
  settings: BusinessPricingSettings,
  state: string | null | undefined,
): BaselineInput {
  let travelCharges = num(est.travel_surcharge_cents) ?? 0;
  const baselineLines: BaselineLine[] = lines.map((row) => {
    const quantity = num(row.quantity) ?? 0;
    const unitCost = num(row.unit_cost_cents);
    const travelTime = isTravelTimeLine(row);
    const priceCents = Math.round(quantity * (num(row.unit_price_cents) ?? 0));
    if (row.adjustment_type === "travel_surcharge" && !travelTime) travelCharges += priceCents;
    return {
      type: baselineType(row.line_item_type),
      isTravelTime: travelTime,
      hoursLow: num(row.hours_low),
      hoursHigh: num(row.hours_high),
      costCents: unitCost == null ? null : Math.round(quantity * unitCost),
      priceCents,
    };
  });
  const low = num(est.labor_hours_low);
  const high = num(est.labor_hours_high);
  return {
    lines: baselineLines,
    estimateHours: low == null && high == null ? null : { low, high },
    travelSurchargeCents: travelCharges,
    sellRateCents: billingRateCentsForState(settings, state),
    costFloorCents: settings.labor_cost_cents_per_hour,
    handlingPct: settings.material_handling_pct,
    handlingOn: est.handling_in_baseline === true,
    otherDirectCents: num(est.other_direct_cost_cents),
    otherDirectConfirmed: est.direct_costs_confirmed_at != null,
    quotedCents: num(est.subtotal_cents) ?? 0,
    warningPct: settings.baseline_warning_pct,
  };
}

export function baselineSnapshot(input: BaselineInput, result: BaselineResult, now = new Date()): BaselineSnapshot {
  return {
    version: 1,
    frozen_at: now.toISOString(),
    sell_rate_cents: input.sellRateCents,
    cost_floor_cents: input.costFloorCents,
    handling_pct: input.handlingPct,
    handling_on: input.handlingOn,
    warning_pct: input.warningPct,
    other_direct_cents: input.otherDirectCents,
    quoted_cents: input.quotedCents,
    result,
  };
}

/** Materials, handling and equipment, shown apart from labor on the panel. Null when a cost is missing. */
export function baselineParts(input: BaselineInput): {
  materialsCostCents: number | null;
  equipmentCostCents: number | null;
  handlingCents: number | null;
} {
  let materials = 0;
  let equipment = 0;
  let handlingBase = 0;
  let missing = false;
  for (const line of input.lines) {
    if (line.type !== "materials" && line.type !== "equipment") continue;
    if (line.costCents == null) { missing = true; continue; }
    if (line.type === "equipment") { equipment += line.costCents; continue; }
    materials += line.costCents;
    if (line.priceCents <= line.costCents) handlingBase += line.costCents;
  }
  if (missing) return { materialsCostCents: null, equipmentCostCents: null, handlingCents: null };
  return {
    materialsCostCents: materials,
    equipmentCostCents: equipment,
    handlingCents: Math.round((handlingBase * input.handlingPct) / 100),
  };
}

type SendGate =
  | { kind: "ok" }
  | { kind: "skip" }
  | { kind: "incomplete"; missing: BaselineResult["missing"] }
  | { kind: "ack_required"; effectiveRateCents: number; costFloorCents: number };

/**
 * Missing hours or costs block sending. A low price only needs an acknowledgment.
 * Warnings never block. Option quotes skip these rules (TASK-183).
 */
export function sendBaselineGate(opts: {
  optionQuote: boolean;
  input: BaselineInput;
  result: BaselineResult;
  acknowledged: boolean;
}): SendGate {
  if (opts.optionQuote) return { kind: "skip" };
  if (!opts.result.complete) return { kind: "incomplete", missing: opts.result.missing };
  if (opts.result.belowCostFloor && !opts.acknowledged) {
    return {
      kind: "ack_required",
      effectiveRateCents: opts.result.effectiveRateCents ?? 0,
      costFloorCents: opts.input.costFloorCents,
    };
  }
  return { kind: "ok" };
}

export interface ChecklistRow {
  key: string;
  label: string;
  /** Anchor of the field that fixes it. */
  href: string;
}

/** One row per missing item, each linking to its field on the estimate page. */
export function beforeSendChecklist(
  missing: BaselineResult["missing"],
  lines: Pick<BaselineLineRow, "description" | "line_item_type" | "adjustment_type" | "hours_source">[],
): ChecklistRow[] {
  return missing.map((item, i) => {
    const line = item.lineIndex != null ? lines[item.lineIndex] : null;
    const name = line?.description?.trim() || (item.lineIndex != null ? `Line ${item.lineIndex + 1}` : "");
    if (item.kind === "other_direct") {
      return {
        key: `other-direct-${i}`,
        label: "Confirm other direct costs (mileage, disposal, permits; $0 is fine)",
        href: "#baseline-other-direct",
      };
    }
    if (item.kind === "cost") {
      return {
        key: `cost-${item.lineIndex}`,
        label: `Enter what "${name}" costs you`,
        href: `#edit-line-cost-${item.lineIndex}`,
      };
    }
    if (item.lineIndex == null) {
      return {
        key: "estimate-hours",
        label: "Enter the person-hours range for this flat price",
        href: "#edit-person-hours-low",
      };
    }
    if (line && isTravelTimeLine(line)) {
      return {
        key: `hours-${item.lineIndex}`,
        label: `Enter hours for "${name}"`,
        href: "#travel-panel",
      };
    }
    return {
      key: `hours-${item.lineIndex}`,
      label: `Enter person-hours for "${name}"`,
      href: `#edit-line-hours-${item.lineIndex}`,
    };
  });
}

export interface LoadedBaseline {
  status: string;
  optionQuote: boolean;
  input: BaselineInput;
  result: BaselineResult;
  lines: BaselineLineRow[];
  frozen: BaselineSnapshot | null;
  costFloorAckAt: string | null;
}

/** Current baseline for one estimate, from its stored lines and today's settings. */
export async function loadEstimateBaseline(
  client: PoolClient,
  estimateId: string,
  accountId: string,
): Promise<LoadedBaseline | null> {
  const est = await client.query<BaselineEstimateRow & {
    status: string;
    baseline_snapshot: BaselineSnapshot | null;
    cost_floor_ack_at: Date | string | null;
    property_state: string | null;
    client_state: string | null;
  }>(
    `SELECT e.status, e.subtotal_cents, e.presentation_mode,
            e.labor_hours_low, e.labor_hours_high, e.travel_surcharge_cents,
            e.handling_in_baseline, e.other_direct_cost_cents, e.direct_costs_confirmed_at,
            e.baseline_snapshot, e.cost_floor_ack_at,
            p.state AS property_state, c.state AS client_state
     FROM estimates e
     ${documentJoins({ root: "e" })}
     WHERE e.id = $1 AND e.account_id = $2`,
    [estimateId, accountId],
  );
  const row = est.rows[0];
  if (!row) return null;

  const lineRows = await client.query<BaselineLineRow>(
    `SELECT line_item_type, quantity, unit_price_cents, unit_cost_cents,
            hours_low, hours_high, hours_source, adjustment_type, description
     FROM estimate_line_items
     WHERE estimate_id = $1 AND option_id IS NULL
     ORDER BY sort_order ASC, created_at ASC`,
    [estimateId],
  );

  const settings = await loadPricingSettings(client, accountId);
  const input = baselineInputFor(row, lineRows.rows, settings, row.property_state ?? row.client_state);
  const ack = row.cost_floor_ack_at;
  return {
    status: row.status,
    optionQuote: row.presentation_mode === "multi_option",
    input,
    result: computeHourlyBaseline(input),
    lines: lineRows.rows,
    frozen: row.baseline_snapshot ?? null,
    costFloorAckAt: ack == null ? null : new Date(ack).toISOString(),
  };
}

/** Everything the baseline reads from an estimate, as one comparable string. */
export async function baselineFingerprint(client: PoolClient, estimateId: string): Promise<string> {
  const { rows } = await client.query<{ fp: string | null }>(
    `SELECT concat_ws('|',
              e.subtotal_cents, e.labor_hours_low, e.labor_hours_high, e.travel_surcharge_cents,
              e.handling_in_baseline, e.other_direct_cost_cents, e.presentation_mode,
              (SELECT string_agg(concat_ws(',', li.line_item_type, li.quantity, li.unit_price_cents,
                                           li.unit_cost_cents, li.hours_low, li.hours_high,
                                           li.adjustment_type, li.option_id),
                                 ';' ORDER BY li.sort_order, li.created_at, li.id)
               FROM estimate_line_items li WHERE li.estimate_id = e.id)) AS fp
     FROM estimates e WHERE e.id = $1`,
    [estimateId],
  );
  return rows[0]?.fp ?? "";
}

/**
 * Any change to lines, hours, costs, other direct costs or the handling switch
 * clears the cost confirmation and the cost-floor acknowledgment. A save that
 * changes none of them (notes only) keeps both.
 */
export async function clearCostConfirmationIfChanged(
  client: PoolClient,
  estimateId: string,
  before: string,
): Promise<boolean> {
  const after = await baselineFingerprint(client, estimateId);
  if (after === before) return false;
  await client.query(
    `UPDATE estimates
     SET direct_costs_confirmed_at = NULL, cost_floor_ack_at = NULL, cost_floor_ack_by = NULL
     WHERE id = $1 AND status = 'draft'`,
    [estimateId],
  );
  return true;
}
