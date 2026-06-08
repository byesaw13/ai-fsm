import { withEstimateContext } from "@/lib/estimates/db";
import { getPool } from "@/lib/db";
import type { EstimateStatus } from "@ai-fsm/domain";
import type { SessionPayload } from "@/lib/auth/session";

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface EstimateRow {
  id: string;
  account_id: string;
  client_id: string;
  job_id: string | null;
  property_id: string | null;
  status: EstimateStatus;
  presentation_mode: "standard" | "multi_option";
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  notes: string | null;
  internal_notes: string | null;
  sent_at: string | null;
  expires_at: string | null;
  share_token: string;
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  internal_labor_cost_cents: number | null;
  internal_material_cost_cents: number | null;
  trip_count: "one_trip" | "multi_trip";
  requires_drying_or_curing: boolean;
  difficult_access: boolean;
  old_house_risk: boolean;
  coordination_required: boolean;
  finish_expectation: "basic" | "clean" | "premium";
  travel_surcharge_cents: number;
  risk_adjustment_cents: number;
  minimum_service_override_reason: "bundled" | "membership_included" | "promo" | "owner_approved" | null;
  minimum_service_override_note: string | null;
  scope_assumptions: string | null;
  condition_tier: "green" | "yellow" | "red" | null;
  pricing_review_status: "needs_review" | "passed" | "blocked";
  created_by: string;
  created_at: string;
  updated_at: string;
  client_name: string | null;
  client_email: string | null;
  job_title: string | null;
  shopping_list_json: unknown | null;
  room_specs: unknown | null;
}

export interface LineItemRow {
  id: string;
  estimate_id: string;
  option_id: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type: "labor" | "materials" | "handling_fee" | "adjustment";
  sort_order: number;
  created_at: string;
}

export interface OptionRow {
  id: string;
  estimate_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recommended: boolean;
  created_at: string;
}

export type OptionWithItems = OptionRow & { line_items: LineItemRow[] };

export interface ChangeOrderLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

export interface ChangeOrder {
  id: string;
  title: string;
  description: string | null;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  declined_at: string | null;
  created_at: string;
  line_items: ChangeOrderLineItem[];
}

export interface EstimateInvoiceRow {
  id: string;
  invoice_kind: string;
  invoice_number: string;
  status: string;
  total_cents: number;
  balance_cents: number;
}

export interface EstimateDetail {
  estimate: EstimateRow;
  lineItems: LineItemRow[];
  options: OptionWithItems[];
  jobVisitCount: number;
  depositInvoice: EstimateInvoiceRow | null;
  finalInvoice: EstimateInvoiceRow | null;
  changeOrders: ChangeOrder[];
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Loads everything the estimate detail page renders: the estimate with client
 * and job names, its line items and options, plus the approved-estimate extras
 * (scheduled-visit count, deposit/final invoices, and change orders).
 *
 * Returns null when the estimate does not exist for this account.
 */
export async function loadEstimateDetail(
  session: SessionPayload,
  id: string
): Promise<EstimateDetail | null> {
  const result = await withEstimateContext(session, async (client) => {
    const estimateResult = await client.query(
      `SELECT e.*, c.name AS client_name, c.email AS client_email, j.title AS job_title
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.id = $1 AND e.account_id = $2`,
      [id, session.accountId]
    );

    if (estimateResult.rowCount === 0) return null;

    const lineItemsResult = await client.query(
      `SELECT id, estimate_id, option_id, description, quantity, unit_price_cents, total_cents, line_item_type, sort_order, created_at
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

    const allLineItems = lineItemsResult.rows as LineItemRow[];
    const options = optionsResult.rows as OptionRow[];

    const optionsWithItems: OptionWithItems[] = options.map((opt) => ({
      ...opt,
      line_items: allLineItems.filter((li) => li.option_id === opt.id),
    }));

    return {
      estimate: estimateResult.rows[0] as EstimateRow,
      lineItems: allLineItems.filter((li) => !li.option_id),
      options: optionsWithItems,
    };
  });

  if (!result) return null;

  const { estimate, lineItems, options } = result;

  // For approved estimates with a linked job, check if any visits are scheduled.
  let jobVisitCount = 0;
  if (estimate.status === "approved" && estimate.job_id) {
    try {
      const pool = getPool();
      const vcRow = await pool.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM visits
         WHERE job_id = $1 AND account_id = $2 AND status != 'cancelled'`,
        [estimate.job_id, session.accountId]
      );
      jobVisitCount = parseInt(vcRow.rows[0]?.count ?? "0", 10);
    } catch {
      // Non-critical — proceed without count
    }
  }

  // Deposit + final invoice status for the approved-estimate billing summary.
  let depositInvoice: EstimateInvoiceRow | null = null;
  let finalInvoice: EstimateInvoiceRow | null = null;
  if (estimate.status === "approved") {
    try {
      const pool = getPool();
      const invRows = await pool.query<EstimateInvoiceRow>(
        `SELECT id, invoice_kind, invoice_number, status, total_cents, balance_cents
         FROM invoices
         WHERE estimate_id = $1 AND account_id = $2 AND invoice_kind IN ('deposit','final')`,
        [id, session.accountId]
      );
      depositInvoice = invRows.rows.find((r) => r.invoice_kind === "deposit") ?? null;
      finalInvoice = invRows.rows.find((r) => r.invoice_kind === "final") ?? null;
    } catch {
      // Non-critical — proceed without billing summary
    }
  }

  // Change orders for this estimate (table may not exist yet).
  let changeOrders: ChangeOrder[] = [];
  try {
    const pool = getPool();
    const coRows = await pool.query<Omit<ChangeOrder, "line_items">>(
      `SELECT co.id, co.title, co.description, co.status, co.subtotal_cents, co.tax_cents, co.total_cents, co.notes,
              u2.full_name as approved_by_name,
              co.approved_at, co.declined_at, co.created_at
       FROM change_orders co
       LEFT JOIN users u2 ON u2.id = co.approved_by
       WHERE co.estimate_id = $1 AND co.account_id = $2
       ORDER BY co.created_at DESC`,
      [id, session.accountId]
    );
    changeOrders = coRows.rows.map((co) => ({ ...co, line_items: [] }));

    for (const co of changeOrders) {
      const items = await pool.query<ChangeOrderLineItem>(
        `SELECT id, description, quantity, unit_price_cents, total_cents, sort_order
         FROM change_order_line_items
         WHERE change_order_id = $1
         ORDER BY sort_order ASC`,
        [co.id]
      );
      co.line_items = items.rows;
    }
  } catch {
    // Change orders table may not exist yet
  }

  return { estimate, lineItems, options, jobVisitCount, depositInvoice, finalInvoice, changeOrders };
}
