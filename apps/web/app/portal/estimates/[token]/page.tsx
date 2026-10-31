import { notFound } from "next/navigation";
import { queryOne, query, getPool } from "@/lib/db";
import { EstimatePortalClient } from "./EstimatePortalClient";
import { isPortalPreview } from "@/lib/portal/session";
import { customerAddOns, showsQuantityAndRate } from "@/lib/estimates/customer-quote";

export const dynamic = "force-dynamic";

interface EstimateRow extends Record<string, unknown> {
  id: string;
  account_id: string;
  status: string;
  presentation_mode: "standard" | "multi_option";
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number | null;
  notes: string | null;
  scope_assumptions: string | null;
  expires_at: string | null;
  responded_at: string | null;
  client_approved_name: string | null;
  client_name: string;
  property_address: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  account_name: string;
  prepared_scope: unknown;
}

interface LineItemRow extends Record<string, unknown> {
  id: string;
  estimate_id: string;
  option_id: string | null;
  description: string;
  line_item_type: string | null;
  quantity: string;
  unit_price_cents: number;
  total_cents: number;
  sort_order: number;
}

interface OptionRow extends Record<string, unknown> {
  id: string;
  estimate_id: string;
  label: string;
  description: string | null;
  sort_order: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recommended: boolean;
}

export default async function EstimatePortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const estimate = await queryOne<EstimateRow>(
    `SELECT
       e.id, e.account_id, e.client_id, e.status, e.presentation_mode, e.subtotal_cents, e.tax_cents, e.total_cents,
       e.deposit_cents, e.notes, e.scope_assumptions, e.expires_at, e.responded_at,
       e.client_approved_name,
       c.name AS client_name,
       p.address AS property_address, p.city AS property_city,
       p.state AS property_state, p.zip AS property_zip,
       a.name AS account_name, e.prepared_scope
     FROM estimates e
     JOIN clients c ON c.id = e.client_id
     JOIN accounts a ON a.id = e.account_id
     LEFT JOIN properties p ON p.id = e.property_id
     WHERE e.share_token = $1`,
    [token]
  );

  if (!estimate) notFound();

  // First portal open → attention event (dedupe handles reloads).
  try {
    const { emitAttentionEvent } = await import("@/lib/attention");
    const pool = getPool();
    const client = await pool.connect();
    try {
      await emitAttentionEvent(client, {
        accountId: estimate.account_id,
        type: "estimate.opened",
        entityType: "estimate",
        entityId: estimate.id,
        title: "Estimate opened",
        summary: estimate.client_name,
        href: `/app/estimates/${estimate.id}`,
        dedupeKey: `estimate.opened:${estimate.id}`,
      });
    } finally {
      client.release();
    }
  } catch {
    // advisory
  }

  const rows = await query<LineItemRow>(
    `SELECT id, estimate_id, option_id, description, line_item_type, quantity, unit_price_cents, total_cents, sort_order
     FROM estimate_line_items
     WHERE estimate_id = $1 AND (visible_to_customer IS NULL OR visible_to_customer = true)
     ORDER BY sort_order`,
    [estimate.id]
  );
  const lineItems = rows.map((li) => ({ ...li, show_quantity_and_rate: showsQuantityAndRate(li.line_item_type) }));

  const options = await query<OptionRow>(
    `SELECT id, estimate_id, label, description, sort_order, subtotal_cents, tax_cents, total_cents, is_recommended
     FROM estimate_options
     WHERE estimate_id = $1
     ORDER BY sort_order`,
    [estimate.id]
  );

  const optionsWithItems = options.map((opt) => ({
    ...opt,
    line_items: lineItems.filter((li) => li.option_id === opt.id),
  }));

  const standardLineItems = lineItems.filter((li) => !li.option_id);

  const { prepared_scope, ...estimateFields } = estimate;

  return (
    <EstimatePortalClient
      token={token}
      estimate={estimateFields}
      addOns={customerAddOns(prepared_scope)}
      lineItems={standardLineItems}
      options={optionsWithItems}
      readOnly={await isPortalPreview(estimate.client_id as string)}
    />
  );
}
