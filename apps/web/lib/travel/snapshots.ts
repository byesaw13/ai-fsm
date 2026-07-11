import type { PoolClient } from "pg";
import {
  buildTravelInvoiceLineDrafts,
  type TravelCalculationResult,
  type TravelCalculationSource,
  type TravelChargeMode,
  type TripCalculationMethod,
  type TripDirectionMode,
} from "@ai-fsm/domain";

export interface TravelSnapshotRow {
  id: string;
  account_id: string;
  origin_address: string;
  destination_address: string;
  one_way_miles: number;
  round_trip_miles: number;
  one_way_minutes: number;
  round_trip_minutes: number;
  total_miles: number;
  total_minutes: number;
  included_miles: number;
  billable_miles: number;
  mileage_rate_cents: number;
  mileage_charge_cents: number;
  billable_travel_minutes: number;
  travel_time_rate_cents: number;
  travel_time_charge_cents: number;
  recommended_total_cents: number;
  total_travel_charge_cents: number;
  trip_count: number;
  trip_direction: TripDirectionMode;
  trip_calculation_method: TripCalculationMethod;
  policy_tier: string;
  charge_mode: TravelChargeMode;
  calculation_source: TravelCalculationSource;
  calculated_at: string;
  manually_overridden: boolean;
  override_reason: string | null;
  client_rule: string | null;
  relationship_type: string | null;
  owner_review_required: boolean;
  owner_review_approved: boolean;
  warnings_json: unknown;
  mileage_rate_id: string | null;
  estimate_id: string | null;
  invoice_id: string | null;
  work_order_id: string | null;
  visit_id: string | null;
  job_id: string | null;
  kind: "estimate" | "actual" | "invoice";
  parent_snapshot_id: string | null;
}

export interface InsertSnapshotInput {
  account_id: string;
  origin_address: string;
  destination_address: string;
  result: TravelCalculationResult;
  calculation_source: TravelCalculationSource;
  trip_calculation_method: TripCalculationMethod;
  mileage_rate_id?: string | null;
  manually_overridden?: boolean;
  override_reason?: string | null;
  owner_review_approved?: boolean;
  estimate_id?: string | null;
  invoice_id?: string | null;
  work_order_id?: string | null;
  visit_id?: string | null;
  job_id?: string | null;
  kind?: "estimate" | "actual" | "invoice";
  parent_snapshot_id?: string | null;
  created_by?: string | null;
}

export async function insertTravelSnapshot(
  client: PoolClient,
  input: InsertSnapshotInput
): Promise<TravelSnapshotRow> {
  const r = input.result;
  const kind = input.kind ?? "estimate";
  const q = await client.query<TravelSnapshotRow>(
    `INSERT INTO travel_calculation_snapshots (
       account_id, origin_address, destination_address,
       one_way_miles, round_trip_miles, one_way_minutes, round_trip_minutes,
       total_miles, total_minutes, included_miles, billable_miles,
       mileage_rate_cents, mileage_charge_cents,
       billable_travel_minutes, travel_time_rate_cents, travel_time_charge_cents,
       recommended_total_cents, total_travel_charge_cents,
       trip_count, trip_direction, trip_calculation_method,
       policy_tier, charge_mode, calculation_source,
       manually_overridden, override_reason,
       client_rule, relationship_type,
       owner_review_required, owner_review_approved,
       warnings_json, mileage_rate_id,
       estimate_id, invoice_id, work_order_id, visit_id, job_id,
       kind, parent_snapshot_id, created_by
     ) VALUES (
       $1,$2,$3,
       $4,$5,$6,$7,
       $8,$9,$10,$11,
       $12,$13,
       $14,$15,$16,
       $17,$18,
       $19,$20,$21,
       $22,$23,$24,
       $25,$26,
       $27,$28,
       $29,$30,
       $31::jsonb,$32,
       $33,$34,$35,$36,$37,
       $38,$39,$40
     )
     RETURNING *`,
    [
      input.account_id,
      input.origin_address,
      input.destination_address,
      r.one_way_miles,
      r.round_trip_miles,
      r.one_way_minutes,
      r.round_trip_minutes,
      r.total_miles,
      r.total_minutes,
      r.included_miles,
      r.billable_miles,
      r.mileage_rate_cents,
      r.mileage_charge_cents,
      r.billable_travel_minutes,
      r.travel_time_rate_cents,
      r.travel_time_charge_cents,
      r.recommended_total_cents,
      r.total_travel_charge_cents,
      r.trip_count,
      r.trip_direction,
      input.trip_calculation_method,
      r.policy_tier,
      r.charge_mode,
      input.calculation_source,
      input.manually_overridden ?? false,
      input.override_reason ?? null,
      r.client_rule,
      r.relationship_type,
      r.owner_review_required,
      input.owner_review_approved ?? false,
      JSON.stringify(r.warnings),
      input.mileage_rate_id ?? null,
      input.estimate_id ?? null,
      input.invoice_id ?? null,
      input.work_order_id ?? null,
      input.visit_id ?? null,
      input.job_id ?? null,
      kind,
      input.parent_snapshot_id ?? null,
      input.created_by ?? null,
    ]
  );
  return normalizeSnapshot(q.rows[0]);
}

export async function getTravelSnapshot(
  client: PoolClient,
  snapshotId: string
): Promise<TravelSnapshotRow | null> {
  const q = await client.query(`SELECT * FROM travel_calculation_snapshots WHERE id = $1`, [
    snapshotId,
  ]);
  if (!q.rowCount) return null;
  return normalizeSnapshot(q.rows[0] as TravelSnapshotRow);
}

function normalizeSnapshot(row: TravelSnapshotRow): TravelSnapshotRow {
  return {
    ...row,
    one_way_miles: Number(row.one_way_miles),
    round_trip_miles: Number(row.round_trip_miles),
    total_miles: Number(row.total_miles),
    included_miles: Number(row.included_miles),
    billable_miles: Number(row.billable_miles),
    one_way_minutes: Number(row.one_way_minutes),
    round_trip_minutes: Number(row.round_trip_minutes),
    total_minutes: Number(row.total_minutes),
    billable_travel_minutes: Number(row.billable_travel_minutes),
    trip_count: Number(row.trip_count),
    mileage_rate_cents: Number(row.mileage_rate_cents),
    mileage_charge_cents: Number(row.mileage_charge_cents),
    travel_time_rate_cents: Number(row.travel_time_rate_cents),
    travel_time_charge_cents: Number(row.travel_time_charge_cents),
    recommended_total_cents: Number(row.recommended_total_cents),
    total_travel_charge_cents: Number(row.total_travel_charge_cents),
  };
}

/** Stable marker embedded in customer-facing travel line descriptions. */
export const TRAVEL_LINE_MARKER = "<!--travel-charge-->";

/**
 * Apply travel charge to an estimate:
 * - updates travel_surcharge_cents
 * - upserts customer-facing line when charge_mode = separate_line
 * - stores snapshot pointer
 *
 * Multi-option estimates store priced choices under option_id; parent totals are
 * intentionally option-driven. Travel apply is blocked at the API for multi_option;
 * this helper still refuses to rewrite parent totals from option_id IS NULL lines.
 */
export async function applyTravelToEstimate(
  client: PoolClient,
  opts: {
    accountId: string;
    estimateId: string;
    snapshot: TravelSnapshotRow;
    settingsLineTitle: string;
    settingsLineDescription: string;
  }
): Promise<void> {
  const { estimateId, snapshot, settingsLineTitle, settingsLineDescription } = opts;
  const chargeMode = snapshot.charge_mode;
  const chargeCents =
    chargeMode === "waive" || chargeMode === "include_in_labor"
      ? 0
      : snapshot.total_travel_charge_cents;

  const modeRow = await client.query<{ presentation_mode: string | null }>(
    `SELECT presentation_mode FROM estimates WHERE id = $1 AND account_id = $2`,
    [estimateId, opts.accountId]
  );
  const presentationMode = modeRow.rows[0]?.presentation_mode ?? "standard";
  const isMultiOption = presentationMode === "multi_option";

  // Remove prior travel surcharge line items (we manage a single travel line)
  await client.query(
    `DELETE FROM estimate_line_items
     WHERE estimate_id = $1
       AND adjustment_type = 'travel_surcharge'`,
    [estimateId]
  );

  // Separate itemized travel lines on multi_option would attach as base
  // (option_id NULL) lines and corrupt totals — only emit for standard estimates.
  if (!isMultiOption && chargeMode === "separate_line" && chargeCents > 0) {
    const drafts = buildTravelInvoiceLineDrafts({
      mileage_charge_cents: snapshot.mileage_charge_cents,
      travel_time_charge_cents: snapshot.travel_time_charge_cents,
      total_travel_charge_cents: snapshot.total_travel_charge_cents,
      billable_miles: snapshot.billable_miles,
      billable_travel_minutes: snapshot.billable_travel_minutes,
      mileage_rate_cents: snapshot.mileage_rate_cents,
      travel_time_rate_cents: snapshot.travel_time_rate_cents,
      title: settingsLineTitle,
      description: settingsLineDescription,
      marker: TRAVEL_LINE_MARKER,
    });
    const maxSort = await client.query<{ m: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) AS m FROM estimate_line_items WHERE estimate_id = $1`,
      [estimateId]
    );
    let sortOrder = Number(maxSort.rows[0]?.m ?? -1) + 1;
    for (const draft of drafts) {
      const qty = draft.quantity > 0 ? draft.quantity : 1;
      await client.query(
        `INSERT INTO estimate_line_items
           (estimate_id, description, quantity, unit_price_cents, total_cents,
            sort_order, line_item_type, visible_to_customer, adjustment_type)
         VALUES ($1, $2, $3, $4, $5, $6, 'adjustment', true, 'travel_surcharge')`,
        [estimateId, draft.description, qty, draft.unit_price_cents, draft.total_cents, sortOrder++]
      );
    }
  }

  // travel_surcharge_cents: used for include_in_labor / custom without a line item.
  // separate_line puts the amount on the line item only — leave field 0 to avoid double-count.
  // For multi_option we still store the snapshot + surcharge field for audit, but do not
  // rewrite parent totals (see recalculateEstimateTotals).
  const surchargeField =
    chargeMode === "include_in_labor"
      ? snapshot.total_travel_charge_cents
      : chargeMode === "custom"
        ? chargeCents
        : chargeMode === "separate_line" && isMultiOption
          ? chargeCents
          : 0;

  await client.query(
    `UPDATE estimates
     SET travel_snapshot_id = $1,
         travel_charge_mode = $2,
         travel_surcharge_cents = $3,
         updated_at = now()
     WHERE id = $4 AND account_id = $5`,
    [snapshot.id, chargeMode, surchargeField, estimateId, opts.accountId]
  );

  // Recalculate estimate totals from line items + surcharge fields (no-op for multi_option)
  await recalculateEstimateTotals(client, estimateId, opts.accountId);
}

async function recalculateEstimateTotals(
  client: PoolClient,
  estimateId: string,
  accountId: string
): Promise<void> {
  const est = await client.query<{
    travel_surcharge_cents: number;
    risk_adjustment_cents: number;
    tax_cents: number;
    presentation_mode: string | null;
  }>(
    `SELECT travel_surcharge_cents, risk_adjustment_cents, tax_cents, presentation_mode
     FROM estimates WHERE id = $1 AND account_id = $2`,
    [estimateId, accountId]
  );
  if (!est.rowCount) return;

  // Multi-option: priced choices live under option_id; parent subtotal/total are not
  // derived from option_id IS NULL lines. Never overwrite them from that SUM.
  if (est.rows[0].presentation_mode === "multi_option") {
    return;
  }

  // If travel is a separate line item, it is already in SUM(line items).
  // travel_surcharge_cents may also be set — only add surcharge field when
  // there is no travel line (include_in_labor / custom without line).
  const hasTravelLine = await client.query(
    `SELECT 1 FROM estimate_line_items
     WHERE estimate_id = $1 AND adjustment_type = 'travel_surcharge' LIMIT 1`,
    [estimateId]
  );
  const lines = await client.query<{ subtotal: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::text AS subtotal
     FROM estimate_line_items WHERE estimate_id = $1 AND option_id IS NULL`,
    [estimateId]
  );
  let subtotal = Number(lines.rows[0]?.subtotal ?? 0);
  if (!(hasTravelLine.rowCount ?? 0)) {
    subtotal += est.rows[0].travel_surcharge_cents;
  }
  subtotal += est.rows[0].risk_adjustment_cents;
  const tax = est.rows[0].tax_cents;
  const total = subtotal + tax;

  await client.query(
    `UPDATE estimates
     SET subtotal_cents = $1, total_cents = $2, balance_cents = GREATEST($2 - deposit_cents, 0),
         updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [subtotal, total, estimateId, accountId]
  );
}

/** Delete any prior travel charge lines on an invoice. */
export async function deleteInvoiceTravelLines(
  client: PoolClient,
  invoiceId: string,
  settingsLineTitle: string
): Promise<void> {
  await client.query(
    `DELETE FROM invoice_line_items
     WHERE invoice_id = $1
       AND (
         description ILIKE $2 || '%'
         OR description ILIKE 'Travel and Service-Area Adjustment%'
         OR description ILIKE 'Travel & mileage%'
         OR description LIKE '%' || $3 || '%'
       )`,
    [invoiceId, settingsLineTitle, TRAVEL_LINE_MARKER]
  );
}

/**
 * Insert itemized travel lines (mileage + travel time when both present)
 * from a snapshot. Does not update invoice totals.
 */
export async function insertInvoiceTravelLines(
  client: PoolClient,
  opts: {
    invoiceId: string;
    snapshot: Pick<
      TravelSnapshotRow,
      | "mileage_charge_cents"
      | "travel_time_charge_cents"
      | "total_travel_charge_cents"
      | "billable_miles"
      | "billable_travel_minutes"
      | "mileage_rate_cents"
      | "travel_time_rate_cents"
    >;
    settingsLineTitle: string;
    settingsLineDescription: string;
  }
): Promise<number> {
  const drafts = buildTravelInvoiceLineDrafts({
    mileage_charge_cents: opts.snapshot.mileage_charge_cents,
    travel_time_charge_cents: opts.snapshot.travel_time_charge_cents,
    total_travel_charge_cents: opts.snapshot.total_travel_charge_cents,
    billable_miles: opts.snapshot.billable_miles,
    billable_travel_minutes: opts.snapshot.billable_travel_minutes,
    mileage_rate_cents: opts.snapshot.mileage_rate_cents,
    travel_time_rate_cents: opts.snapshot.travel_time_rate_cents,
    title: opts.settingsLineTitle,
    description: opts.settingsLineDescription,
    marker: TRAVEL_LINE_MARKER,
  });
  if (drafts.length === 0) return 0;

  const maxSort = await client.query<{ m: number }>(
    `SELECT COALESCE(MAX(sort_order), -1) AS m FROM invoice_line_items WHERE invoice_id = $1`,
    [opts.invoiceId]
  );
  let sortOrder = Number(maxSort.rows[0]?.m ?? -1) + 1;

  for (const draft of drafts) {
    // quantity must be > 0 per check constraint
    const qty = draft.quantity > 0 ? draft.quantity : 1;
    await client.query(
      `INSERT INTO invoice_line_items
         (invoice_id, description, quantity, unit_price_cents, total_cents,
          line_item_type, sort_order, visible_to_customer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
      [
        opts.invoiceId,
        draft.description,
        qty,
        draft.unit_price_cents,
        draft.total_cents,
        draft.line_item_type,
        sortOrder++,
      ]
    );
  }
  return drafts.length;
}

/**
 * Ensure an invoice has itemized travel lines for a carried snapshot.
 * Used on estimate→invoice convert when travel was include_in_labor (no line)
 * or when a single combined line should be expanded to mileage + time.
 *
 * When `replaceExisting` is true, removes prior travel lines first.
 * Does not rewrite invoice totals (convert keeps estimate totals).
 */
export async function ensureInvoiceTravelLinesFromSnapshot(
  client: PoolClient,
  opts: {
    invoiceId: string;
    snapshot: TravelSnapshotRow;
    settingsLineTitle: string;
    settingsLineDescription: string;
    replaceExisting?: boolean;
  }
): Promise<number> {
  if (opts.snapshot.total_travel_charge_cents <= 0) return 0;
  if (opts.snapshot.charge_mode === "waive") return 0;

  if (opts.replaceExisting) {
    await deleteInvoiceTravelLines(client, opts.invoiceId, opts.settingsLineTitle);
  } else {
    const existing = await client.query(
      `SELECT 1 FROM invoice_line_items
       WHERE invoice_id = $1 AND description LIKE '%' || $2 || '%'
       LIMIT 1`,
      [opts.invoiceId, TRAVEL_LINE_MARKER]
    );
    // Also detect legacy single travel lines without marker
    const legacy = await client.query(
      `SELECT 1 FROM invoice_line_items
       WHERE invoice_id = $1
         AND (
           description ILIKE $2 || '%'
           OR description ILIKE 'Travel and Service-Area Adjustment%'
         )
       LIMIT 1`,
      [opts.invoiceId, opts.settingsLineTitle]
    );
    if ((existing.rowCount ?? 0) > 0 || (legacy.rowCount ?? 0) > 0) {
      // Expand a single legacy line into itemized components when possible
      await deleteInvoiceTravelLines(client, opts.invoiceId, opts.settingsLineTitle);
    }
  }

  return insertInvoiceTravelLines(client, {
    invoiceId: opts.invoiceId,
    snapshot: opts.snapshot,
    settingsLineTitle: opts.settingsLineTitle,
    settingsLineDescription: opts.settingsLineDescription,
  });
}

/**
 * Apply travel to a draft invoice as itemized line items (or remove).
 */
export async function applyTravelToInvoice(
  client: PoolClient,
  opts: {
    accountId: string;
    invoiceId: string;
    snapshot: TravelSnapshotRow;
    settingsLineTitle: string;
    settingsLineDescription: string;
    billingMode: "estimated" | "actual" | "none" | "custom";
  }
): Promise<void> {
  const { invoiceId, snapshot, billingMode } = opts;

  await deleteInvoiceTravelLines(client, invoiceId, opts.settingsLineTitle);

  if (billingMode !== "none" && snapshot.total_travel_charge_cents > 0) {
    await insertInvoiceTravelLines(client, {
      invoiceId,
      snapshot,
      settingsLineTitle: opts.settingsLineTitle,
      settingsLineDescription: opts.settingsLineDescription,
    });
  }

  await client.query(
    `UPDATE invoices
     SET travel_snapshot_id = $1,
         travel_billing_mode = $2,
         updated_at = now()
     WHERE id = $3 AND account_id = $4`,
    [snapshot.id, billingMode, invoiceId, opts.accountId]
  );

  // Recalc invoice totals from all lines (itemized travel included)
  const totals = await client.query<{ subtotal: string }>(
    `SELECT COALESCE(SUM(total_cents), 0)::text AS subtotal
     FROM invoice_line_items WHERE invoice_id = $1`,
    [invoiceId]
  );
  const subtotal = Math.max(0, Number(totals.rows[0]?.subtotal ?? 0));
  await client.query(
    `UPDATE invoices
     SET subtotal_cents = $1, tax_cents = 0, total_cents = $1, updated_at = now()
     WHERE id = $2 AND account_id = $3`,
    [subtotal, invoiceId, opts.accountId]
  );
}
